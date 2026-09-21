/**
 * SoundFont 2 (SF2) Pure Web Audio Synthesizer Engine
 * 
 * Standalone, zero-dependency, specification-compliant SoundFont 2 (RIFF sfbk) parser & player.
 * Solves the fragile third-party parser issues by robustly decoding real-world .sf2 files,
 * extracting presets, instruments, zones, generators, and 16-bit PCM samples directly into Web Audio buffers.
 */

export interface SF2PresetInfo {
  index: number;
  name: string;
  bank: number;
  preset: number;
}

export interface SF2Metadata {
  name: string;
  author?: string;
  version?: string;
  presetCount: number;
  sampleCount: number;
  fileSizeBytes: number;
}

interface SF2Sample {
  index: number;
  name: string;
  start: number;
  end: number;
  startLoop: number;
  endLoop: number;
  sampleRate: number;
  originalPitch: number;
  pitchCorrection: number;
  sampleType: number;
}

interface SF2Zone {
  keyRange: { min: number; max: number };
  velRange: { min: number; max: number };
  sampleIndex?: number;
  instrumentIndex?: number;
  overridingRootKey?: number;
  coarseTune?: number;
  fineTune?: number;
  sampleModes?: number; // 0=no loop, 1=continuous loop, 3=loop while pressed
  initialAttenuation?: number; // centibels
  attackVolEnv?: number; // timecents
  holdVolEnv?: number;
  decayVolEnv?: number;
  sustainVolEnv?: number;
  releaseVolEnv?: number;
}

interface SF2Instrument {
  name: string;
  zones: SF2Zone[];
}

interface SF2InternalPreset {
  index: number;
  name: string;
  bank: number;
  preset: number;
  zones: SF2Zone[];
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  midiNumber: number;
  startTime: number;
  releaseTimeSec: number;
}

function timecentsToSeconds(timecents?: number, fallback = 0.2): number {
  if (timecents === undefined || timecents <= -12000) return fallback;
  if (timecents >= 8000) return 10.0;
  const sec = Math.pow(2, timecents / 1200);
  return Math.max(0.003, Math.min(10.0, sec));
}

class SF2EngineManager {
  private arrayBuffer: ArrayBuffer | null = null;
  private dataView: DataView | null = null;
  private smplByteOffset: number = 0;
  private smplByteLength: number = 0;

  private soundFontName: string = '';
  private samples: SF2Sample[] = [];
  private presets: SF2PresetInfo[] = [];
  private internalPresets: SF2InternalPreset[] = [];
  private activePresetIndex: number = 0;

  private audioBufferCache: Map<number, AudioBuffer> = new Map();
  private activeVoices: Map<number, ActiveVoice[]> = new Map();
  private isLoaded: boolean = false;
  private metadata: SF2Metadata | null = null;

  /**
   * Load and parse raw SoundFont2 ArrayBuffer with high resilience
   */
  public async loadBuffer(buffer: ArrayBuffer, fileName: string): Promise<SF2Metadata> {
    try {
      this.clearCurrentSoundFont();

      if (!buffer || buffer.byteLength < 32) {
        throw new Error('Arquivo corrompido ou muito pequeno para ser um SoundFont válido.');
      }

      const view = new DataView(buffer);
      const u8 = new Uint8Array(buffer);

      const readFourCC = (offset: number): string => {
        if (offset + 4 > buffer.byteLength) return '';
        return String.fromCharCode(u8[offset], u8[offset + 1], u8[offset + 2], u8[offset + 3]);
      };

      const readFixedString = (offset: number, maxLen: number): string => {
        let str = '';
        const limit = Math.min(buffer.byteLength, offset + maxLen);
        for (let i = offset; i < limit; i++) {
          const c = u8[i];
          if (c === 0) break;
          // Keep readable characters
          if (c >= 32 && c <= 126) {
            str += String.fromCharCode(c);
          }
        }
        return str.trim();
      };

      // 1. Verify RIFF and sfbk signature
      const riffHeader = readFourCC(0);
      const sfbkHeader = readFourCC(8);

      if (riffHeader !== 'RIFF' || sfbkHeader !== 'sfbk') {
        throw new Error(
          'O arquivo não possui o formato SoundFont 2 (RIFF sfbk). Se você baixou um arquivo compactado (.zip, .rar ou .sf3), extraia o arquivo .sf2 antes de carregar.'
        );
      }

      // 2. Scan top-level LIST chunks (INFO, sdta, pdta)
      let pos = 12;
      let infoStart = 0, infoEnd = 0;
      let sdtaStart = 0, sdtaEnd = 0;
      let pdtaStart = 0, pdtaEnd = 0;

      while (pos + 8 <= buffer.byteLength) {
        const chunkId = readFourCC(pos);
        const chunkSize = view.getUint32(pos + 4, true);
        const contentStart = pos + 8;
        const contentEnd = Math.min(buffer.byteLength, contentStart + chunkSize);

        if (chunkId === 'LIST' && contentStart + 4 <= buffer.byteLength) {
          const listType = readFourCC(contentStart);
          const subStart = contentStart + 4;
          if (listType === 'INFO') {
            infoStart = subStart;
            infoEnd = contentEnd;
          } else if (listType === 'sdta') {
            sdtaStart = subStart;
            sdtaEnd = contentEnd;
          } else if (listType === 'pdta') {
            pdtaStart = subStart;
            pdtaEnd = contentEnd;
          }
        }

        // RIFF subchunks must be padded to even 2-byte boundary
        pos = contentEnd + (chunkSize % 2);
      }

      if (!pdtaStart) {
        throw new Error('Arquivo SF2 corrompido: bloco de definições dos instrumentos (pdta) ausente.');
      }

      // 3. Extract Metadata from INFO
      let detectedName = '';
      let detectedAuthor = '';
      let detectedSoftware = '';

      if (infoStart) {
        let p = infoStart;
        while (p + 8 <= infoEnd) {
          const id = readFourCC(p);
          const sz = view.getUint32(p + 4, true);
          const valStart = p + 8;
          if (id === 'INAM') detectedName = readFixedString(valStart, sz);
          else if (id === 'IENG') detectedAuthor = readFixedString(valStart, sz);
          else if (id === 'ISFT') detectedSoftware = readFixedString(valStart, sz);
          p = valStart + sz + (sz % 2);
        }
      }

      this.soundFontName = detectedName || fileName.replace(/\.sf2$/i, '');

      // 4. Extract sdta -> smpl (16-bit linear PCM audio)
      let smplOffset = 0;
      let smplLength = 0;

      if (sdtaStart) {
        let p = sdtaStart;
        while (p + 8 <= sdtaEnd) {
          const id = readFourCC(p);
          const sz = view.getUint32(p + 4, true);
          const valStart = p + 8;
          if (id === 'smpl') {
            smplOffset = valStart;
            smplLength = sz;
            break;
          }
          p = valStart + sz + (sz % 2);
        }
      }

      this.arrayBuffer = buffer;
      this.dataView = view;
      this.smplByteOffset = smplOffset;
      this.smplByteLength = smplLength;

      // 5. Index pdta Hydra subchunks by ID
      const pdta: Record<string, { offset: number; size: number }> = {};
      let p = pdtaStart;
      while (p + 8 <= pdtaEnd) {
        const id = readFourCC(p);
        const sz = view.getUint32(p + 4, true);
        const valStart = p + 8;
        pdta[id] = { offset: valStart, size: sz };
        p = valStart + sz + (sz % 2);
      }

      // Required chunks check
      if (!pdta['phdr'] || !pdta['pbag'] || !pdta['pgen'] || !pdta['inst'] || !pdta['ibag'] || !pdta['igen'] || !pdta['shdr']) {
        throw new Error('Arquivo SF2 corrompido: estrutura de tabelas do sintetizador incompleta.');
      }

      // 6. Parse Samples (shdr: 46 bytes each)
      const parsedSamples: SF2Sample[] = [];
      const shdrChunk = pdta['shdr'];
      const sampleCount = Math.floor(shdrChunk.size / 46);

      for (let i = 0; i < sampleCount; i++) {
        const o = shdrChunk.offset + i * 46;
        const rawName = readFixedString(o, 20);
        // Skip terminal EOS record
        if (rawName.toUpperCase() === 'EOS' || i === sampleCount - 1) continue;

        const start = view.getUint32(o + 20, true);
        const end = view.getUint32(o + 24, true);
        const startLoop = view.getUint32(o + 28, true);
        const endLoop = view.getUint32(o + 32, true);
        const rawRate = view.getUint32(o + 36, true);
        const origPitch = u8[o + 40];
        const pitchCorr = view.getInt8(o + 41);
        const sampleType = view.getUint16(o + 44, true);

        // Sanitize values
        const sampleRate = rawRate >= 4000 && rawRate <= 384000 ? rawRate : 44100;
        const originalPitch = origPitch > 0 && origPitch <= 127 ? origPitch : 60;

        parsedSamples.push({
          index: i,
          name: rawName || `Sample ${i}`,
          start,
          end,
          startLoop,
          endLoop,
          sampleRate,
          originalPitch,
          pitchCorrection: pitchCorr,
          sampleType,
        });
      }
      this.samples = parsedSamples;

      // 7. Parse Instruments & Instrument Zones (inst, ibag, igen)
      const instChunk = pdta['inst'];
      const ibagChunk = pdta['ibag'];
      const igenChunk = pdta['igen'];

      const totalInsts = Math.floor(instChunk.size / 22);
      const totalIbags = Math.floor(ibagChunk.size / 4);
      const totalIgens = Math.floor(igenChunk.size / 4);

      const parsedInstruments: SF2Instrument[] = [];

      for (let instIdx = 0; instIdx < totalInsts - 1; instIdx++) {
        const instOffset = instChunk.offset + instIdx * 22;
        const nextInstOffset = instChunk.offset + (instIdx + 1) * 22;
        const instName = readFixedString(instOffset, 20);
        const bagStart = view.getUint16(instOffset + 20, true);
        const bagEnd = Math.min(totalIbags, view.getUint16(nextInstOffset + 20, true));

        let globalZone: SF2Zone = {
          keyRange: { min: 0, max: 127 },
          velRange: { min: 0, max: 127 },
        };
        const instZones: SF2Zone[] = [];

        for (let bagIdx = bagStart; bagIdx < bagEnd; bagIdx++) {
          const bagOffset = ibagChunk.offset + bagIdx * 4;
          const nextBagOffset = ibagChunk.offset + (bagIdx + 1) * 4;
          const genStart = view.getUint16(bagOffset, true);
          const genEnd = Math.min(totalIgens, view.getUint16(nextBagOffset, true));

          const currentZone: Partial<SF2Zone> = {};

          for (let genIdx = genStart; genIdx < genEnd; genIdx++) {
            const genOffset = igenChunk.offset + genIdx * 4;
            const oper = view.getUint16(genOffset, true);
            const amountInt16 = view.getInt16(genOffset + 2, true);
            const amountUint16 = view.getUint16(genOffset + 2, true);

            switch (oper) {
              case 43: // keyRange
                currentZone.keyRange = {
                  min: amountUint16 & 0xff,
                  max: (amountUint16 >> 8) & 0xff,
                };
                break;
              case 44: // velRange
                currentZone.velRange = {
                  min: amountUint16 & 0xff,
                  max: (amountUint16 >> 8) & 0xff,
                };
                break;
              case 48: // initialAttenuation
                currentZone.initialAttenuation = amountInt16;
                break;
              case 51: // coarseTune
                currentZone.coarseTune = amountInt16;
                break;
              case 52: // fineTune
                currentZone.fineTune = amountInt16;
                break;
              case 53: // sampleID
                currentZone.sampleIndex = amountUint16;
                break;
              case 54: // sampleModes
                currentZone.sampleModes = amountUint16;
                break;
              case 58: // overridingRootKey
                if (amountInt16 >= 0 && amountInt16 <= 127) {
                  currentZone.overridingRootKey = amountInt16;
                }
                break;
              case 34: // attackVolEnv
                currentZone.attackVolEnv = amountInt16;
                break;
              case 36: // decayVolEnv
                currentZone.decayVolEnv = amountInt16;
                break;
              case 37: // sustainVolEnv
                currentZone.sustainVolEnv = amountInt16;
                break;
              case 38: // releaseVolEnv
                currentZone.releaseVolEnv = amountInt16;
                break;
            }
          }

          // If zone has no sampleID, it acts as the global instrument default zone
          if (currentZone.sampleIndex === undefined) {
            globalZone = { ...globalZone, ...currentZone };
          } else {
            instZones.push({
              keyRange: currentZone.keyRange || globalZone.keyRange || { min: 0, max: 127 },
              velRange: currentZone.velRange || globalZone.velRange || { min: 0, max: 127 },
              sampleIndex: currentZone.sampleIndex,
              overridingRootKey: currentZone.overridingRootKey ?? globalZone.overridingRootKey,
              coarseTune: currentZone.coarseTune ?? globalZone.coarseTune ?? 0,
              fineTune: currentZone.fineTune ?? globalZone.fineTune ?? 0,
              sampleModes: currentZone.sampleModes ?? globalZone.sampleModes,
              initialAttenuation: currentZone.initialAttenuation ?? globalZone.initialAttenuation,
              attackVolEnv: currentZone.attackVolEnv ?? globalZone.attackVolEnv,
              releaseVolEnv: currentZone.releaseVolEnv ?? globalZone.releaseVolEnv,
            });
          }
        }

        parsedInstruments.push({
          name: instName,
          zones: instZones,
        });
      }

      // 8. Parse Presets & Preset Zones (phdr, pbag, pgen)
      const phdrChunk = pdta['phdr'];
      const pbagChunk = pdta['pbag'];
      const pgenChunk = pdta['pgen'];

      const totalPresets = Math.floor(phdrChunk.size / 38);
      const totalPbags = Math.floor(pbagChunk.size / 4);
      const totalPgens = Math.floor(pgenChunk.size / 4);

      const resolvedPresets: SF2InternalPreset[] = [];
      const publicPresets: SF2PresetInfo[] = [];

      for (let pIdx = 0; pIdx < totalPresets - 1; pIdx++) {
        const pOffset = phdrChunk.offset + pIdx * 38;
        const nextPOffset = phdrChunk.offset + (pIdx + 1) * 38;
        const rawPresetName = readFixedString(pOffset, 20);
        // Skip terminal EOP
        if (rawPresetName.toUpperCase() === 'EOP') continue;

        const presetNum = view.getUint16(pOffset + 20, true);
        const bankNum = view.getUint16(pOffset + 22, true);
        const bagStart = view.getUint16(pOffset + 24, true);
        const bagEnd = Math.min(totalPbags, view.getUint16(nextPOffset + 24, true));

        let presetGlobal: Partial<SF2Zone> = {};
        const presetPlayableZones: SF2Zone[] = [];

        for (let bagIdx = bagStart; bagIdx < bagEnd; bagIdx++) {
          const bagOffset = pbagChunk.offset + bagIdx * 4;
          const nextBagOffset = pbagChunk.offset + (bagIdx + 1) * 4;
          const genStart = view.getUint16(bagOffset, true);
          const genEnd = Math.min(totalPgens, view.getUint16(nextBagOffset, true));

          let pZoneKeyRange: { min: number; max: number } | undefined;
          let pZoneVelRange: { min: number; max: number } | undefined;
          let instIndex: number | undefined;

          for (let genIdx = genStart; genIdx < genEnd; genIdx++) {
            const genOffset = pgenChunk.offset + genIdx * 4;
            const oper = view.getUint16(genOffset, true);
            const amountUint16 = view.getUint16(genOffset + 2, true);

            if (oper === 41) {
              instIndex = amountUint16;
            } else if (oper === 43) {
              pZoneKeyRange = {
                min: amountUint16 & 0xff,
                max: (amountUint16 >> 8) & 0xff,
              };
            } else if (oper === 44) {
              pZoneVelRange = {
                min: amountUint16 & 0xff,
                max: (amountUint16 >> 8) & 0xff,
              };
            }
          }

          if (instIndex === undefined) {
            if (pZoneKeyRange) presetGlobal.keyRange = pZoneKeyRange;
            if (pZoneVelRange) presetGlobal.velRange = pZoneVelRange;
          } else if (instIndex < parsedInstruments.length) {
            // Expand instrument zones into this preset
            const inst = parsedInstruments[instIndex];
            const effPresetKeyRange = pZoneKeyRange || presetGlobal.keyRange || { min: 0, max: 127 };
            const effPresetVelRange = pZoneVelRange || presetGlobal.velRange || { min: 0, max: 127 };

            inst.zones.forEach((iz) => {
              // Intersect preset zone ranges with instrument zone ranges
              const minKey = Math.max(effPresetKeyRange.min, iz.keyRange.min);
              const maxKey = Math.min(effPresetKeyRange.max, iz.keyRange.max);
              const minVel = Math.max(effPresetVelRange.min, iz.velRange.min);
              const maxVel = Math.min(effPresetVelRange.max, iz.velRange.max);

              if (minKey <= maxKey && minVel <= maxVel) {
                presetPlayableZones.push({
                  ...iz,
                  keyRange: { min: minKey, max: maxKey },
                  velRange: { min: minVel, max: maxVel },
                  instrumentIndex: instIndex,
                });
              }
            });
          }
        }

        const cleanPresetName = rawPresetName || `Timbre ${presetNum}`;
        resolvedPresets.push({
          index: resolvedPresets.length,
          name: cleanPresetName,
          bank: bankNum,
          preset: presetNum,
          zones: presetPlayableZones,
        });

        publicPresets.push({
          index: publicPresets.length,
          name: cleanPresetName,
          bank: bankNum,
          preset: presetNum,
        });
      }

      this.internalPresets = resolvedPresets;
      this.presets = publicPresets;
      this.activePresetIndex = 0;
      this.isLoaded = true;

      this.metadata = {
        name: this.soundFontName,
        author: detectedAuthor || detectedSoftware || '',
        version: 'SoundFont 2.04',
        presetCount: publicPresets.length,
        sampleCount: parsedSamples.length,
        fileSizeBytes: buffer.byteLength,
      };

      return this.metadata;
    } catch (err: any) {
      this.clearCurrentSoundFont();
      console.error('SF2 Loading Failure:', err);
      throw new Error(err?.message || 'Falha ao processar o arquivo SF2. Verifique se é um SoundFont 2 descompactado.');
    }
  }

  public getIsLoaded(): boolean {
    return this.isLoaded && this.arrayBuffer !== null && this.presets.length > 0;
  }

  public getSoundFontName(): string {
    return this.soundFontName;
  }

  public getMetadata(): SF2Metadata | null {
    return this.metadata;
  }

  public getPresets(): SF2PresetInfo[] {
    return this.presets;
  }

  public getActivePresetIndex(): number {
    return this.activePresetIndex;
  }

  public getActivePreset(): SF2PresetInfo | null {
    if (this.presets.length === 0) return null;
    return this.presets[this.activePresetIndex] || this.presets[0];
  }

  public selectPreset(index: number) {
    if (index >= 0 && index < this.presets.length) {
      this.activePresetIndex = index;
      this.stopAllVoices();
    }
  }

  public clearCurrentSoundFont() {
    this.stopAllVoices();
    this.arrayBuffer = null;
    this.dataView = null;
    this.smplByteOffset = 0;
    this.smplByteLength = 0;
    this.soundFontName = '';
    this.samples = [];
    this.presets = [];
    this.internalPresets = [];
    this.activePresetIndex = 0;
    this.audioBufferCache.clear();
    this.isLoaded = false;
    this.metadata = null;
  }

  /**
   * Builds or returns an AudioBuffer for the given sample record
   */
  private getOrCreateAudioBuffer(ctx: AudioContext, sample: SF2Sample): AudioBuffer | null {
    if (!this.arrayBuffer || !this.dataView || this.smplByteOffset <= 0) return null;

    let audioBuffer = this.audioBufferCache.get(sample.index);
    if (audioBuffer) return audioBuffer;

    const sampleCount = sample.end - sample.start;
    if (sampleCount <= 0) return null;

    try {
      const sampleRate = Math.max(8000, Math.min(192000, sample.sampleRate || 44100));
      audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
      const channelData = audioBuffer.getChannelData(0);

      const baseOffset = this.smplByteOffset + sample.start * 2;
      const maxAvailableSamples = Math.floor((this.arrayBuffer.byteLength - baseOffset) / 2);
      const safeLength = Math.min(sampleCount, maxAvailableSamples);

      for (let i = 0; i < safeLength; i++) {
        const rawInt16 = this.dataView.getInt16(baseOffset + i * 2, true);
        channelData[i] = rawInt16 / 32768.0;
      }

      this.audioBufferCache.set(sample.index, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn(`Could not create AudioBuffer for sample ${sample.name}:`, err);
      return null;
    }
  }

  /**
   * Play MIDI note using real samples from active SF2 preset
   */
  public playNote(
    ctx: AudioContext,
    destination: AudioNode,
    midiNumber: number,
    velocity: number = 90
  ): boolean {
    if (!this.isLoaded || !this.arrayBuffer || !this.dataView) {
      return false;
    }

    const currentPreset = this.internalPresets[this.activePresetIndex] || this.internalPresets[0];
    if (!currentPreset) {
      return false;
    }

    // Stop existing voice if note is already sounding
    this.stopNote(midiNumber);

    try {
      // 1. Locate matching zones for this note and velocity
      let targetZones = currentPreset.zones.filter(
        (z) =>
          midiNumber >= z.keyRange.min &&
          midiNumber <= z.keyRange.max &&
          velocity >= z.velRange.min &&
          velocity <= z.velRange.max &&
          z.sampleIndex !== undefined
      );

      // Fallback A: If velocity restricted, ignore velocity filter
      if (targetZones.length === 0) {
        targetZones = currentPreset.zones.filter(
          (z) =>
            midiNumber >= z.keyRange.min &&
            midiNumber <= z.keyRange.max &&
            z.sampleIndex !== undefined
        );
      }

      // Fallback B: If keyRange restricted (e.g. soundfont covers only certain octaves),
      // pick the nearest zone by pitch so no keyboard note ever fails to sound!
      if (targetZones.length === 0 && currentPreset.zones.length > 0) {
        const zonesWithSamples = currentPreset.zones.filter((z) => z.sampleIndex !== undefined);
        if (zonesWithSamples.length > 0) {
          let bestZone = zonesWithSamples[0];
          let bestDistance = 999;
          zonesWithSamples.forEach((z) => {
            const center = (z.keyRange.min + z.keyRange.max) / 2;
            const dist = Math.abs(midiNumber - center);
            if (dist < bestDistance) {
              bestDistance = dist;
              bestZone = z;
            }
          });
          targetZones = [bestZone];
        }
      }

      // Fallback C: Global sample fallback
      if (targetZones.length === 0 && this.samples.length > 0) {
        let bestSample = this.samples[0];
        let bestDist = 999;
        this.samples.forEach((s) => {
          const dist = Math.abs(midiNumber - s.originalPitch);
          if (dist < bestDist) {
            bestDist = dist;
            bestSample = s;
          }
        });
        targetZones = [
          {
            keyRange: { min: 0, max: 127 },
            velRange: { min: 0, max: 127 },
            sampleIndex: bestSample.index,
          },
        ];
      }

      if (targetZones.length === 0) {
        return false;
      }

      const playedVoices: ActiveVoice[] = [];
      const now = ctx.currentTime;

      targetZones.forEach((zone) => {
        if (zone.sampleIndex === undefined) return;
        const sample = this.samples.find((s) => s.index === zone.sampleIndex);
        if (!sample) return;

        const audioBuffer = this.getOrCreateAudioBuffer(ctx, sample);
        if (!audioBuffer) return;

        // Calculate pitch shift
        const rootKey =
          zone.overridingRootKey !== undefined
            ? zone.overridingRootKey
            : sample.originalPitch > 0 && sample.originalPitch <= 127
            ? sample.originalPitch
            : 60;

        const coarseTune = zone.coarseTune || 0;
        const fineTune = (zone.fineTune || 0) + (sample.pitchCorrection || 0);
        const semitoneDiff = midiNumber - rootKey + coarseTune + fineTune / 100;
        const playbackRate = Math.pow(2, semitoneDiff / 12);

        // Web Audio source
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.setValueAtTime(playbackRate, now);

        // Loop handling (1 = continuous loop, 3 = loop while note is pressed)
        const isLoop = zone.sampleModes === 1 || zone.sampleModes === 3;
        if (isLoop && sample.endLoop > sample.startLoop && sample.endLoop <= sample.end) {
          const sampleRate = sample.sampleRate || 44100;
          const loopStartSec = (sample.startLoop - sample.start) / sampleRate;
          const loopEndSec = (sample.endLoop - sample.start) / sampleRate;

          if (
            loopStartSec >= 0 &&
            loopEndSec <= audioBuffer.duration &&
            loopEndSec - loopStartSec > 0.005
          ) {
            source.loop = true;
            source.loopStart = loopStartSec;
            source.loopEnd = loopEndSec;
          }
        }

        // Voice Gain & Envelope
        const voiceGain = ctx.createGain();

        // Musical velocity response curve (exponential dynamic response)
        const normalizedVel = Math.max(0.05, Math.min(1.0, velocity / 127));
        const velGain = Math.pow(normalizedVel, 1.25);
        const atten = zone.initialAttenuation ? Math.pow(10, -zone.initialAttenuation / 200) : 1;
        const peakGain = Math.min(1.0, velGain * atten * 0.9);

        const attackSec = timecentsToSeconds(zone.attackVolEnv, 0.003);
        const releaseSec = timecentsToSeconds(zone.releaseVolEnv, 0.28);

        voiceGain.gain.setValueAtTime(0.0001, now);
        voiceGain.gain.linearRampToValueAtTime(Math.max(0.001, peakGain), now + attackSec);

        source.connect(voiceGain);
        voiceGain.connect(destination);

        source.start(now);

        playedVoices.push({
          source,
          gain: voiceGain,
          midiNumber,
          startTime: now,
          releaseTimeSec: releaseSec,
        });
      });

      if (playedVoices.length > 0) {
        this.activeVoices.set(midiNumber, playedVoices);
        return true;
      }

      return false;
    } catch (err) {
      console.warn(`SF2 playback error on note ${midiNumber}:`, err);
      return false;
    }
  }

  /**
   * Release MIDI note with smooth envelope fade-out
   */
  public stopNote(midiNumber: number, ctx?: AudioContext) {
    const voices = this.activeVoices.get(midiNumber);
    if (!voices || voices.length === 0) return;

    voices.forEach((voice) => {
      try {
        const now = ctx ? ctx.currentTime : voice.gain.context.currentTime;
        const releaseTime = voice.releaseTimeSec || 0.25;

        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);

        setTimeout(() => {
          try {
            voice.source.stop();
            voice.source.disconnect();
            voice.gain.disconnect();
          } catch {
            // Already closed
          }
        }, releaseTime * 1000 + 40);
      } catch {
        // Voice already disconnected
      }
    });

    this.activeVoices.delete(midiNumber);
  }

  public stopAllVoices() {
    this.activeVoices.forEach((voices) => {
      voices.forEach((voice) => {
        try {
          voice.source.stop();
          voice.source.disconnect();
          voice.gain.disconnect();
        } catch {
          // ignore
        }
      });
    });
    this.activeVoices.clear();
  }
}

export const sf2Engine = new SF2EngineManager();
