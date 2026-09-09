/**
 * SoundFont 2 (SF2) Web Audio Synthesizer Engine
 * Decodes real acoustic/sampled instruments (.sf2) from phone memory (iPhone/Android)
 * and plays them with low latency, polyphony and ADSR envelopes.
 */

import { SoundFont2 } from 'soundfont2';

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

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  midiNumber: number;
  startTime: number;
}

class SF2EngineManager {
  private sf2Instance: SoundFont2 | null = null;
  private soundFontName: string = '';
  private presets: SF2PresetInfo[] = [];
  private activePresetIndex: number = 0;
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private activeVoices: Map<number, ActiveVoice> = new Map();
  private isLoaded: boolean = false;
  private metadata: SF2Metadata | null = null;

  /**
   * Load and parse raw SoundFont2 ArrayBuffer
   */
  public async loadBuffer(buffer: ArrayBuffer, fileName: string): Promise<SF2Metadata> {
    try {
      this.clearCurrentSoundFont();

      if (!buffer || buffer.byteLength < 16) {
        throw new Error('Arquivo corrompido ou vazio.');
      }

      // Check RIFF and sfbk header
      const headerBytes = new Uint8Array(buffer.slice(0, 12));
      const riffHeader = String.fromCharCode(...headerBytes.slice(0, 4));
      const sfbkHeader = String.fromCharCode(...headerBytes.slice(8, 12));

      if (riffHeader !== 'RIFF' || sfbkHeader !== 'sfbk') {
        throw new Error(
          'O arquivo não possui o formato SoundFont 2 (RIFF sfbk). Se você baixou um .zip ou .sf3, extraia o arquivo .sf2 antes de carregar.'
        );
      }

      const uint8 = new Uint8Array(buffer);
      const sf2 = new SoundFont2(uint8);
      this.sf2Instance = sf2;
      this.soundFontName = fileName.replace(/\.sf2$/i, '');

      // Parse available presets
      const parsedPresets: SF2PresetInfo[] = [];
      if (sf2.presets && sf2.presets.length > 0) {
        sf2.presets.forEach((preset, idx) => {
          if (preset.header) {
            const rawName = preset.header.name || `Preset ${preset.header.preset}`;
            // Clean unprintable ASCII / null characters common in old SF2 files
            const cleanName = rawName.replace(/[\x00-\x1F\x7F]/g, '').trim();
            parsedPresets.push({
              index: idx,
              name: cleanName || `Timbre ${preset.header.preset}`,
              bank: preset.header.bank,
              preset: preset.header.preset,
            });
          }
        });
      }

      this.presets = parsedPresets;
      this.activePresetIndex = 0;
      this.isLoaded = true;

      this.metadata = {
        name: this.soundFontName,
        author: sf2.metaData?.author || '',
        version: sf2.metaData?.version || '',
        presetCount: parsedPresets.length,
        sampleCount: sf2.samples?.length || 0,
        fileSizeBytes: buffer.byteLength,
      };

      return this.metadata;
    } catch (err: any) {
      this.clearCurrentSoundFont();
      console.error('Error parsing SF2 SoundFont:', err);
      const msg = err?.message || 'Falha ao processar o arquivo SF2. Verifique se é um arquivo SoundFont 2 válido.';
      throw new Error(msg);
    }
  }

  public getIsLoaded(): boolean {
    return this.isLoaded && this.sf2Instance !== null;
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
      // Clear voices when switching preset to avoid hung notes
      this.stopAllVoices();
    }
  }

  public clearCurrentSoundFont() {
    this.stopAllVoices();
    this.sf2Instance = null;
    this.soundFontName = '';
    this.presets = [];
    this.activePresetIndex = 0;
    this.audioBufferCache.clear();
    this.isLoaded = false;
    this.metadata = null;
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
    if (!this.isLoaded || !this.sf2Instance) {
      return false;
    }

    const activePreset = this.getActivePreset();
    if (!activePreset) {
      return false;
    }

    // Stop existing voice if note already sounding
    this.stopNote(midiNumber);

    try {
      // Query sample and key data from SF2 for current note and preset
      let keyData: any = null;
      try {
        keyData = this.sf2Instance.getKeyData(
          midiNumber,
          activePreset.bank,
          activePreset.preset
        );
      } catch {
        keyData = null;
      }

      let sample = keyData?.sample;

      // Fallback: If no sample zone mapped for this exact note, find nearest sample in SF2 by pitch
      if (!sample || !sample.data || sample.data.length === 0) {
        const availableSamples = this.sf2Instance.samples.filter(
          (s) => s && s.data && s.data.length > 0 && s.header && s.header.name !== 'EOS'
        );
        if (availableSamples.length === 0) {
          return false;
        }

        let bestSample = availableSamples[0];
        let minDiff = Math.abs((bestSample.header.originalPitch || 60) - midiNumber);

        for (let i = 1; i < availableSamples.length; i++) {
          const s = availableSamples[i];
          const diff = Math.abs((s.header.originalPitch || 60) - midiNumber);
          if (diff < minDiff) {
            minDiff = diff;
            bestSample = s;
          }
        }
        sample = bestSample;
      }

      if (!sample || !sample.data || sample.data.length === 0) {
        return false;
      }

      const sampleHeader = sample.header;

      // Get or create AudioBuffer for this sample
      const sampleCacheKey = `${sampleHeader.name}_${sampleHeader.sampleRate}_${sample.data.length}`;
      let audioBuffer = this.audioBufferCache.get(sampleCacheKey);

      if (!audioBuffer) {
        const sampleRate = sampleHeader.sampleRate || 44100;
        const length = sample.data.length;
        audioBuffer = ctx.createBuffer(1, length, sampleRate);
        const channelData = audioBuffer.getChannelData(0);
        const rawInt16 = sample.data;

        // Convert 16-bit PCM (-32768 to 32767) to Web Audio float32 (-1.0 to 1.0)
        for (let i = 0; i < length; i++) {
          channelData[i] = rawInt16[i] / 32768.0;
        }

        this.audioBufferCache.set(sampleCacheKey, audioBuffer);
      }

      // Calculate sample pitch ratio
      const rootKey =
        sampleHeader.originalPitch > 0 && sampleHeader.originalPitch <= 127
          ? sampleHeader.originalPitch
          : 60;
      const fineTuneCents = sampleHeader.pitchCorrection || 0;
      const semitonesDiff = (midiNumber - rootKey) + (fineTuneCents / 100);
      const playbackRate = Math.pow(2, semitonesDiff / 12);

      // Create Web Audio nodes
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);

      // Setup loop if sample specifies loop points
      const sRate = sampleHeader.sampleRate || 44100;
      const loopStartSec = sampleHeader.startLoop / sRate;
      const loopEndSec = sampleHeader.endLoop / sRate;

      if (
        loopEndSec > loopStartSec &&
        loopStartSec >= 0 &&
        loopEndSec <= audioBuffer.duration &&
        loopEndSec - loopStartSec > 0.01
      ) {
        source.loop = true;
        source.loopStart = loopStartSec;
        source.loopEnd = loopEndSec;
      }

      // Voice Gain & Envelope
      const now = ctx.currentTime;
      const voiceGain = ctx.createGain();

      // Velocity scaling (0 to 1 with musical dynamic curve)
      const normalizedVel = Math.max(0.1, Math.min(1, velocity / 127));
      const targetVolume = Math.pow(normalizedVel, 1.2) * 0.85;

      // Fast attack to prevent digital pops
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(targetVolume, now + 0.005);

      source.connect(voiceGain);
      voiceGain.connect(destination);

      source.start(now);

      this.activeVoices.set(midiNumber, {
        source,
        gain: voiceGain,
        midiNumber,
        startTime: now,
      });

      return true;
    } catch (err) {
      console.warn(`SF2 playback error on note ${midiNumber}:`, err);
      return false;
    }
  }

  /**
   * Release MIDI note with smooth envelope fade-out
   */
  public stopNote(midiNumber: number, ctx?: AudioContext) {
    const voice = this.activeVoices.get(midiNumber);
    if (!voice) return;

    try {
      const now = ctx ? ctx.currentTime : voice.gain.context.currentTime;
      const releaseTime = 0.22; // Natural acoustic decay release

      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);

      setTimeout(() => {
        try {
          voice.source.stop();
          voice.source.disconnect();
          voice.gain.disconnect();
        } catch {
          // already stopped
        }
      }, releaseTime * 1000 + 40);
    } catch {
      // voice already closed
    }

    this.activeVoices.delete(midiNumber);
  }

  public stopAllVoices() {
    this.activeVoices.forEach((voice) => {
      try {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch {
        // ignore
      }
    });
    this.activeVoices.clear();
  }
}

export const sf2Engine = new SF2EngineManager();
