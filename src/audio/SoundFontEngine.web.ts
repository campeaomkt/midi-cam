/**
 * SoundFontEngine.web.ts
 * Web implementation of SoundFontEngine using FluidSynth 2.4.6 WASM (js-synthesizer 1.11.0).
 * Matches exact behavior and API contracts from MIDI Cam reference.
 */

import { WebFluidSynth } from './webFluidSynth';
import { soundFontLibrary, SoundFontCatalogEntry } from './soundFontLibrary';
import { getSharedAudioContext, ensureAudioContextRunning } from './sharedAudioContext';

export class SoundFontEngineWeb {
  private fluidSynth: WebFluidSynth;
  private ctx: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private destinationNode: AudioNode | null = null;
  private isReady = false;
  private isLoading = false;
  private hasSoundFontLoaded = false;
  private loadProgress = 0;
  private activeBankName = 'Nenhum SoundFont Ativo';
  private isSustainDown = false;
  private listeners: Array<() => void> = [];
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.fluidSynth = new WebFluidSynth({
      polyphony: 256,
      gain: 0.55,
    });
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public getIsReady(): boolean {
    return this.isReady;
  }

  public isSoundFontLoaded(): boolean {
    return this.hasSoundFontLoaded;
  }

  public getIsLoading(): boolean {
    return this.isLoading;
  }

  public getLoadProgress(): number {
    return this.loadProgress;
  }

  public getActiveBankName(): string {
    return this.activeBankName;
  }

  public getGain(): number {
    return this.fluidSynth.getGain();
  }

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = getSharedAudioContext();
    }
    return this.ctx;
  }

  public getOutputNode(): AudioNode | null {
    return this.masterGainNode;
  }

  public connectDestination(target: AudioNode): void {
    if (this.destinationNode === target && this.masterGainNode) {
      return;
    }
    this.destinationNode = target;
    if (!this.masterGainNode) {
      return;
    }
    try {
      this.masterGainNode.disconnect();
    } catch {}
    try {
      this.masterGainNode.connect(target);
    } catch (e) {
      console.warn('[SoundFontEngine] Error connecting master gain to target destination:', e);
    }
  }

  private async ensureEngineReady(audioContext?: AudioContext, destination?: AudioNode): Promise<void> {
    if (this.isReady && this.fluidSynth.getIsReady()) {
      return;
    }

    this.ctx = audioContext || this.ctx || getSharedAudioContext();
    if (this.ctx.state === 'suspended') {
      ensureAudioContextRunning(this.ctx).catch(() => {});
    }

    if (!this.masterGainNode) {
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.value = 1.0;
    }

    const target = destination || this.destinationNode || this.ctx.destination;
    this.connectDestination(target);

    await this.fluidSynth.init(this.ctx, this.masterGainNode);
    this.isReady = true;
  }

  public async init(audioContext?: AudioContext, destination?: AudioNode): Promise<void> {
    if (destination) {
      this.destinationNode = destination;
      if (this.masterGainNode) {
        this.connectDestination(destination);
      }
    }

    if (this.isReady && this.fluidSynth.getIsReady()) {
      return;
    }

    if (this.initPromise) {
      try {
        await this.initPromise;
        if (this.isReady && this.fluidSynth.getIsReady()) {
          return;
        }
      } catch {
        this.initPromise = null;
      }
    }

    this.initPromise = (async () => {
      try {
        await this.ensureEngineReady(audioContext, destination);

        // Auto load active soundfont or default bank
        await this.loadActiveSoundFont();
      } catch (err) {
        console.error('[SoundFontEngine] Failed to initialize FluidSynth engine:', err);
        this.initPromise = null;
        this.isReady = false;
        throw err;
      } finally {
        this.notify();
      }
    })();

    return this.initPromise;
  }

  public async loadActiveSoundFont(): Promise<void> {
    const active = soundFontLibrary.getActive();
    if (!active) {
      this.activeBankName = 'Nenhum SoundFont Ativo';
      this.hasSoundFontLoaded = false;
      this.notify();
      return;
    }

    this.isLoading = true;
    this.loadProgress = 20;
    this.notify();

    try {
      this.activeBankName = active.name;
      this.loadProgress = 30;
      this.notify();

      if (!this.isReady || !this.fluidSynth.getIsReady()) {
        await this.ensureEngineReady();
      }

      const bytes = await soundFontLibrary.readBytes(active.id);
      if (bytes && bytes.byteLength > 1024) {
        this.loadProgress = 60;
        this.notify();
        await this.fluidSynth.loadSoundFont(bytes);
        this.hasSoundFontLoaded = true;
        this.activeBankName = active.name;
        this.loadProgress = 100;
        console.log(`[SoundFontEngine] Successfully loaded custom SF2: ${this.activeBankName}`);
      } else {
        this.hasSoundFontLoaded = false;
        this.activeBankName = 'Nenhum SoundFont Ativo';
        throw new Error('Não foi possível ler os dados do arquivo SoundFont (.sf2).');
      }
    } catch (err) {
      this.hasSoundFontLoaded = false;
      this.activeBankName = 'Nenhum SoundFont Ativo';
      console.error('[SoundFontEngine] Error loading soundfont:', err);
      throw err;
    } finally {
      this.isLoading = false;
      this.loadProgress = 0;
      this.notify();
    }
  }

  public async loadSoundFontBytes(bytes: ArrayBuffer, name = 'Custom SF2'): Promise<void> {
    this.isLoading = true;
    this.loadProgress = 30;
    this.notify();

    try {
      if (!this.isReady || !this.fluidSynth.getIsReady()) {
        await this.ensureEngineReady();
      }
      this.loadProgress = 60;
      this.notify();

      await this.fluidSynth.loadSoundFont(bytes);
      this.hasSoundFontLoaded = true;
      this.activeBankName = name;
      this.loadProgress = 100;
    } catch (err) {
      console.error('[SoundFontEngine] Error in loadSoundFontBytes:', err);
      throw err;
    } finally {
      this.isLoading = false;
      this.loadProgress = 0;
      this.notify();
    }
  }

  public async selectBank(id: string): Promise<void> {
    if (!this.isReady || !this.fluidSynth.getIsReady()) {
      await this.ensureEngineReady();
    }
    await soundFontLibrary.setActive(id);
    await this.loadActiveSoundFont();
  }

  public async importAndLoad(file: File | ArrayBuffer, name: string): Promise<SoundFontCatalogEntry> {
    const entry = await soundFontLibrary.importSoundFont(file, name);
    await this.selectBank(entry.id);
    return entry;
  }

  public async deleteBank(id: string): Promise<void> {
    await soundFontLibrary.deleteSoundFont(id);
    await this.loadActiveSoundFont();
  }

  /**
   * Note On (Channel 0, touch velocity default 96)
   * Hardware MIDI 1:1 (no key folding / transposition)
   */
  public noteOn(note: number, velocity = 96): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      ensureAudioContextRunning(this.ctx).catch(() => {});
    }

    if (!this.isReady) {
      // Lazy init on first touch if user interacted
      this.init()
        .then(() => {
          this.fluidSynth.noteOn(0, note, velocity);
        })
        .catch(() => {});
      return;
    }
    this.fluidSynth.noteOn(0, note, velocity);
  }

  /**
   * Note Off (Channel 0)
   */
  public noteOff(note: number): void {
    if (!this.isReady) return;
    this.fluidSynth.noteOff(0, note);
  }

  /**
   * CC64 Sustain with Hysteresis (64 on / 40 off)
   * Sends binary 127 or 0 (no intermediate values) per spec
   */
  public handleSustainCC(value: number): void {
    if (value >= 64 && !this.isSustainDown) {
      this.isSustainDown = true;
      this.fluidSynth.setSustain(0, true);
    } else if (value <= 40 && this.isSustainDown) {
      this.isSustainDown = false;
      this.fluidSynth.setSustain(0, false);
    }
  }

  public setSustain(isDown: boolean): void {
    this.isSustainDown = isDown;
    this.fluidSynth.setSustain(0, isDown);
  }

  /**
   * Panic: clears all sounding notes, kills sustain, resets controllers
   */
  public panic(): void {
    this.isSustainDown = false;
    this.fluidSynth.panic();
  }

  /**
   * Volume control: percent / 100 (floor 0.01, clamp 0 - 1.5)
   * Default ~55% -> 0.55
   */
  public setVolume(percent: number): void {
    const gain = Math.max(0.01, Math.min(1.5, percent / 100));
    this.fluidSynth.setGain(gain);
    this.notify();
  }

  public setGain(gain: number): void {
    this.fluidSynth.setGain(gain);
    this.notify();
  }

  public setReleaseTime(seconds: number): void {
    this.fluidSynth.setReleaseTime(seconds);
  }
}

export const SoundFontEngine = new SoundFontEngineWeb();
