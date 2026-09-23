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
  pan?: number; // -500 to +500 (generator 17)
  initialFilterFc?: number; // generator 8 (timecents or Hz)
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
  panner?: StereoPannerNode;
  filter?: BiquadFilterNode;
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
              case 17: // pan (-500 to +500)
                currentZone.pan = amountInt16;
                break;
              case 8: // initialFilterFc
                currentZone.initialFilterFc = amountInt16;
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
              pan: currentZone.pan ?? globalZone.pan,
              initialFilterFc: currentZone.initialFilterFc ?? globalZone.initialFilterFc,
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
          let pZonePan: number | undefined;
          let instIndex: number | undefined;

          for (let genIdx = genStart; genIdx < genEnd; genIdx++) {
            const genOffset = pgenChunk.offset + genIdx * 4;
            const oper = view.getUint16(genOffset, true);
            const amountUint16 = view.getUint16(genOffset + 2, true);
            const amountInt16 = view.getInt16(genOffset + 2, true);

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
            } else if (oper === 17) {
              pZonePan = amountInt16;
            }
          }

          if (instIndex === undefined) {
            if (pZoneKeyRange) presetGlobal.keyRange = pZoneKeyRange;
            if (pZoneVelRange) presetGlobal.velRange = pZoneVelRange;
            if (pZonePan !== undefined) presetGlobal.pan = pZonePan;
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
                  pan: pZonePan ?? iz.pan ?? presetGlobal.pan,
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
      // 1. Locate matching zones for this note
      let keyZones = currentPreset.zones.filter(
        (z) =>
          midiNumber >= z.keyRange.min &&
          midiNumber <= z.keyRange.max &&
          z.sampleIndex !== undefined
      );

      // Fallback A: If keyRange restricted (e.g. soundfont covers only certain octaves),
      // pick the nearest zone by pitch so no keyboard note ever fails to sound
      if (keyZones.length === 0 && currentPreset.zones.length > 0) {
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
          keyZones = [bestZone];
        }
      }

      // Fallback B: Global sample fallback if preset has no zones
      if (keyZones.length === 0 && this.samples.length > 0) {
        let bestSample = this.samples[0];
        let bestDist = 999;
        this.samples.forEach((s) => {
          const dist = Math.abs(midiNumber - s.originalPitch);
          if (dist < bestDist) {
            bestDist = dist;
            bestSample = s;
          }
        });
        keyZones = [
          {
            keyRange: { min: 0, max: 127 },
            velRange: { min: 0, max: 127 },
            sampleIndex: bestSample.index,
          },
        ];
      }

      if (keyZones.length === 0) {
        return false;
      }

      // 2. Velocity Layer Selection:
      // Find zones that explicitly encompass this velocity
      let velZones = keyZones.filter(
        (z) => velocity >= z.velRange.min && velocity <= z.velRange.max
      );

      // If no zone covers this velocity exactly (e.g. gaps between layers or velocity out of bounds):
      // DO NOT play all layers simultaneously! Pick the single velocity layer closest to this velocity.
      if (velZones.length === 0) {
        let minVelDiff = 999;
        keyZones.forEach((z) => {
          let diff = 0;
          if (velocity < z.velRange.min) diff = z.velRange.min - velocity;
          else if (velocity > z.velRange.max) diff = velocity - z.velRange.max;
          if (diff < minVelDiff) {
            minVelDiff = diff;
          }
        });

        velZones = keyZones.filter((z) => {
          let diff = 0;
          if (velocity < z.velRange.min) diff = z.velRange.min - velocity;
          else if (velocity > z.velRange.max) diff = velocity - z.velRange.max;
          return Math.abs(diff - minVelDiff) <= 1;
        });
      }

      // 3. Stereo and Mono Zone Assignment:
      // In standard SF2 players (sforzando, Audio Evolution):
      // - If preset has Left & Right stereo samples, play both cleanly.
      // - If preset has Mono samples, play the single matching zone.
      const finalZones: SF2Zone[] = [];
      let leftZone: SF2Zone | null = null;
      let rightZone: SF2Zone | null = null;
      let monoZone: SF2Zone | null = null;

      for (const z of velZones) {
        if (z.sampleIndex === undefined) continue;
        const s = this.samples.find((sample) => sample.index === z.sampleIndex);
        if (!s) continue;

        const isLeft = (s.sampleType & 0x0004) !== 0 || /[-_]l\b/i.test(s.name) || (z.pan !== undefined && z.pan <= -50);
        const isRight = (s.sampleType & 0x0002) !== 0 || /[-_]r\b/i.test(s.name) || (z.pan !== undefined && z.pan >= 50);

        if (isLeft && !leftZone) {
          leftZone = z;
        } else if (isRight && !rightZone) {
          rightZone = z;
        } else if (!isLeft && !isRight && !monoZone) {
          monoZone = z;
        }
      }

      if (leftZone && rightZone) {
        finalZones.push(leftZone, rightZone);
      } else if (leftZone) {
        finalZones.push(leftZone);
      } else if (rightZone) {
        finalZones.push(rightZone);
      } else if (monoZone) {
        finalZones.push(monoZone);
      } else {
        finalZones.push(...velZones.slice(0, 2));
      }

      if (finalZones.length === 0) {
        return false;
      }

      const playedVoices: ActiveVoice[] = [];
      const now = ctx.currentTime;

      finalZones.forEach((zone) => {
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

        // Voice Gain & Velocity Dynamics (Professional DAW acoustic standard: 24dB dynamic range)
        const voiceGain = ctx.createGain();

        const clampedVel = Math.max(1, Math.min(127, velocity));
        const normVel = (clampedVel - 1) / 126; // 0..1
        // Linear decibel scaling from -24dB (audible, delicate pianissimo) to 0dB (full fortissimo)
        const targetDb = -24 * (1 - normVel);
        const velGain = Math.pow(10, targetDb / 20); // 0.251 at vel 1, 1.0 at vel 127

        // Generator initialAttenuation (centibels -> linear gain)
        const safeAttenCB = Math.min(200, Math.max(0, zone.initialAttenuation || 0));
        const atten = Math.pow(10, -safeAttenCB / 200);

        // Full line-level headroom
        const nominalHeadroom = 0.85;
        const peakGain = Math.min(1.0, velGain * atten * nominalHeadroom);

        // Volume Envelope (Attack, Decay to Sustain body, Release on key-up)
        const attackSec = timecentsToSeconds(zone.attackVolEnv, 0.002);
        const decaySec = timecentsToSeconds(zone.decayVolEnv, 6.0);
        const releaseSec = timecentsToSeconds(zone.releaseVolEnv, 0.45);

        // Natural acoustic body sustain (rings warmly, does not choke out the notes)
        const sustainGain = isLoop ? peakGain * 0.65 : peakGain * 0.85;

        // Attack ramp
        voiceGain.gain.setValueAtTime(0.001, now);
        voiceGain.gain.linearRampToValueAtTime(Math.max(0.01, peakGain), now + attackSec);
        // Smooth natural decay into sustain body
        voiceGain.gain.setTargetAtTime(sustainGain, now + attackSec, Math.max(0.3, decaySec / 3));

        // Stereo Panning (Respects SF2 pan or sample channel, zero artificial spread)
        let panner: StereoPannerNode | undefined;
        if (ctx.createStereoPanner) {
          panner = ctx.createStereoPanner();
          const isLeft = (sample.sampleType & 0x0004) !== 0 || /[-_]l\b/i.test(sample.name) || (zone.pan !== undefined && zone.pan <= -50);
          const isRight = (sample.sampleType & 0x0002) !== 0 || /[-_]r\b/i.test(sample.name) || (zone.pan !== undefined && zone.pan >= 50);

          if (zone.pan !== undefined) {
            panner.pan.setValueAtTime(Math.max(-1, Math.min(1, zone.pan / 1000)), now);
          } else if (isLeft) {
            panner.pan.setValueAtTime(-0.8, now);
          } else if (isRight) {
            panner.pan.setValueAtTime(0.8, now);
          } else {
            panner.pan.setValueAtTime(0, now);
          }
        }

        // Direct pristine audio graph (DAW style): source -> voiceGain -> [panner] -> destination
        source.connect(voiceGain);
        if (panner) {
          voiceGain.connect(panner);
          panner.connect(destination);
        } else {
          voiceGain.connect(destination);
        }

        source.start(now);

        playedVoices.push({
          source,
          gain: voiceGain,
          panner,
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
   * Release MIDI note with smooth envelope fade-out (no pops or clicks)
   */
  public stopNote(midiNumber: number, ctx?: AudioContext) {
    const voices = this.activeVoices.get(midiNumber);
    if (!voices || voices.length === 0) return;

    voices.forEach((voice) => {
      try {
        const now = ctx ? ctx.currentTime : voice.gain.context.currentTime;
        const releaseTime = voice.releaseTimeSec || 0.28;

        voice.gain.gain.cancelScheduledValues(now);
        // Smooth exponential target decay - completely pop-free and click-free
        voice.gain.gain.setTargetAtTime(0, now, Math.max(0.02, releaseTime / 3.5));

        setTimeout(() => {
          try {
            voice.source.stop();
            voice.source.disconnect();
            if (voice.filter) voice.filter.disconnect();
            if (voice.panner) voice.panner.disconnect();
            voice.gain.disconnect();
          } catch {
            // Already closed
          }
        }, releaseTime * 1000 + 80);
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
          if (voice.filter) voice.filter.disconnect();
          if (voice.panner) voice.panner.disconnect();
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
