/**
 * webFluidSynth.ts
 * Real FluidSynth 2.4.6 WASM Audio Engine powered by js-synthesizer 1.11.0.
 * Directly ported from MIDI Cam specification.
 *
 * Pathways:
 * 1) AudioWorkletNodeSynthesizer (lowest latency, off-main-thread processing)
 * 2) ScriptProcessor Synthesizer fallback (universal compatibility)
 */

import {
  AudioWorkletNodeSynthesizer,
  Synthesizer,
  waitForReady,
  ISynthesizer,
} from 'js-synthesizer';
import { resolveAssetUrl } from '../utils/assetUrl';

export interface WebFluidSynthOptions {
  polyphony?: number;
  gain?: number;
  sampleRate?: number;
}

export class WebFluidSynth {
  private synth: ISynthesizer | null = null;
  private audioNode: AudioNode | null = null;
  private ctx: AudioContext | null = null;
  private loadedSFontId: number | null = null;
  private isInitialized = false;
  private isWorkletMode = false;
  private currentGain = 0.55;
  private polyphony = 256;
  private destinationNode: AudioNode | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options?: WebFluidSynthOptions) {
    if (options?.polyphony) this.polyphony = options.polyphony;
    if (options?.gain !== undefined) this.currentGain = Math.max(0.01, Math.min(1.5, options.gain));
  }

  public getIsReady(): boolean {
    return this.isInitialized && this.synth !== null;
  }

  public getAudioNode(): AudioNode | null {
    return this.audioNode;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public connectDestination(target: AudioNode): void {
    if (this.audioNode) {
      try {
        if (this.destinationNode && this.destinationNode !== target) {
          this.audioNode.disconnect();
        }
      } catch {}
      try {
        this.audioNode.connect(target);
      } catch (e) {
        console.warn('[FluidSynth] Error connecting audio node to target destination:', e);
      }
    }
    this.destinationNode = target;
  }

  public async init(audioContext: AudioContext, destination?: AudioNode): Promise<void> {
    if (destination) {
      this.destinationNode = destination;
    }

    if (this.isInitialized && this.synth) {
      if (destination && this.audioNode) {
        this.connectDestination(destination);
      }
      return;
    }

    if (this.initPromise) {
      try {
        await this.initPromise;
        if (this.synth) {
          if (destination && this.audioNode) {
            this.connectDestination(destination);
          }
          return;
        }
      } catch {
        this.initPromise = null;
      }
    }

    this.initPromise = (async () => {
      this.ctx = audioContext;

      // Ensure audio context is running if user interacted
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {}
      }

      const targetDestination = destination || this.destinationNode || this.ctx.destination;
      this.destinationNode = targetDestination;

      // Ensure libfluidsynth WASM module is bound
      await this.ensureMainThreadScriptLoaded();

      // 1. Try AudioWorklet first if supported
      let workletSuccess = false;
      if (this.ctx.audioWorklet) {
        try {
          const libWorkletUrl = resolveAssetUrl('fluidsynth/libfluidsynth-2.4.6.js');
          const synthWorkletUrl = resolveAssetUrl('fluidsynth/js-synthesizer.worklet.js');
          await this.ctx.audioWorklet.addModule(libWorkletUrl);
          await this.ctx.audioWorklet.addModule(synthWorkletUrl);

          const workletSynth = new AudioWorkletNodeSynthesizer();
          workletSynth.init(this.ctx.sampleRate);
          const node = workletSynth.createAudioNode(this.ctx, {
            initialGain: this.currentGain,
            polyphony: this.polyphony,
          });

          node.connect(targetDestination);
          this.synth = workletSynth;
          this.audioNode = node;
          this.isWorkletMode = true;
          workletSuccess = true;
          console.log('[FluidSynth] AudioWorklet 2.4.6 initialized successfully');
        } catch (workletErr) {
          console.warn('[FluidSynth] AudioWorklet init failed, falling back to Main-Thread Synthesizer:', workletErr);
        }
      }

      // 2. Fallback to ScriptProcessor Synthesizer (Standard in Tauri / Safari / large banks)
      if (!workletSuccess) {
        try {
          await this.ensureMainThreadScriptLoaded();

          const SynthClass = (typeof window !== 'undefined' && (window as any).JSSynth?.Synthesizer) || Synthesizer;
          const fallbackSynth = new SynthClass();
          fallbackSynth.init(this.ctx.sampleRate, {
            initialGain: this.currentGain,
            polyphony: 256,
            reverbActive: true,
            reverbRoomSize: 0.35,
            reverbDamp: 0.45,
            reverbWidth: 0.7,
            reverbLevel: 0.22,
          });
          const node = fallbackSynth.createAudioNode(this.ctx, 1024);

          node.connect(targetDestination);
          this.synth = fallbackSynth;
          this.audioNode = node;
          this.isWorkletMode = false;
          console.log('[FluidSynth] Main-thread fallback Synthesizer initialized successfully with 256 polyphony & 1024 buffer');
        } catch (fallbackErr) {
          console.error('[FluidSynth] Failed to initialize fallback synthesizer:', fallbackErr);
          throw fallbackErr;
        }
      }

      // Configure default parameters per MIDI Cam spec
      this.applyEngineDefaults();
      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  private async ensureMainThreadScriptLoaded(): Promise<void> {
    if (typeof window === 'undefined') return;

    const win = window as any;

    const bindModule = (mod: any): boolean => {
      if (mod && (typeof mod.addFunction === 'function' || typeof mod.cwrap === 'function' || mod.calledRun)) {
        try {
          if (typeof (Synthesizer as any).initializeWithFluidSynthModule === 'function') {
            (Synthesizer as any).initializeWithFluidSynthModule(mod);
          }
          if (win.JSSynth && typeof (win.JSSynth.Synthesizer as any)?.initializeWithFluidSynthModule === 'function') {
            (win.JSSynth.Synthesizer as any).initializeWithFluidSynthModule(mod);
          }
          console.log('[FluidSynth] Successfully bound WASM module to Synthesizer');
          return true;
        } catch (e) {
          console.warn('[FluidSynth] Error binding module:', e);
        }
      }
      return false;
    };

    // 1. If global JSSynth is available from script tag, await waitForReady()
    if (win.JSSynth && typeof win.JSSynth.waitForReady === 'function') {
      try {
        await win.JSSynth.waitForReady();
        const m = win.Module || (typeof globalThis !== 'undefined' && (globalThis as any).Module);
        if (m && bindModule(m)) {
          return;
        }
      } catch (e) {
        console.warn('[FluidSynth] JSSynth.waitForReady note:', e);
      }
    }

    const curMod = win.Module || (typeof globalThis !== 'undefined' && (globalThis as any).Module);
    if (curMod && curMod.calledRun && bindModule(curMod)) {
      return;
    }

    if (win.__fluidsynth_ready_promise) {
      try {
        const mod = await win.__fluidsynth_ready_promise;
        if (bindModule(mod || win.Module)) {
          return;
        }
      } catch (err) {
        console.warn('[FluidSynth] Error waiting for __fluidsynth_ready_promise:', err);
      }
    }

    // Wait until Module.addFunction / Module.cwrap / Module.calledRun are ready
    return new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const m = win.Module || (typeof globalThis !== 'undefined' && (globalThis as any).Module);
        if (m && (m.calledRun || typeof m.addFunction === 'function' || typeof m.cwrap === 'function')) {
          if (bindModule(m)) {
            clearInterval(interval);
            resolve();
            return;
          }
        }
        if (attempts > 300) { // 15 seconds
          clearInterval(interval);
          const finalMod = win.Module || (typeof globalThis !== 'undefined' && (globalThis as any).Module);
          if (bindModule(finalMod)) {
            resolve();
          } else {
            reject(new Error('Tempo esgotado aguardando compilação do WebAssembly do FluidSynth.'));
          }
        }
      }, 50);
    });
  }

  private applyEngineDefaults() {
    if (!this.synth) return;
    try {
      // Direct gain scaling
      this.synth.setGain(this.currentGain);
      // High-quality cubic/4th-order sample interpolation (enum 2 = FLUID_INTERP_4THORDER)
      try {
        if (typeof (this.synth as any).setInterpolation === 'function') {
          (this.synth as any).setInterpolation(2);
        }
      } catch {}
      // Disable artificial reverb so the soundfont plays 100% dry and natural, exactly as designed (standard DAW behavior)
      (this.synth as any).setReverbOn?.(false);
    } catch (e) {
      console.warn('[FluidSynth] Error setting initial settings:', e);
    }
  }

  public setReleaseTime(_seconds = 0.45) {
    // No-op: Do not override SoundFont internal release envelopes.
    // Preserve authentic soundfont sample releases and envelopes as defined in the SF2 file.
  }

  public async fallbackToScriptProcessor(): Promise<void> {
    if (!this.ctx) return;
    try {
      if (this.audioNode) {
        this.audioNode.disconnect();
      }
    } catch {}

    console.log('[FluidSynth] Switching to Main-Thread Synthesizer engine...');
    await this.ensureMainThreadScriptLoaded();

    const targetDestination = this.destinationNode || this.ctx.destination;
    const SynthClass = (typeof window !== 'undefined' && (window as any).JSSynth?.Synthesizer) || Synthesizer;
    const fallbackSynth = new SynthClass();
    fallbackSynth.init(this.ctx.sampleRate, {
      initialGain: this.currentGain,
      polyphony: 256,
      reverbActive: false,
    });
    const node = fallbackSynth.createAudioNode(this.ctx, 1024);
    node.connect(targetDestination);

    this.synth = fallbackSynth;
    this.audioNode = node;
    this.isWorkletMode = false;
    this.loadedSFontId = null;
    this.isInitialized = true;
    this.applyEngineDefaults();
    console.log('[FluidSynth] Main-Thread Synthesizer engine active and ready with 256 polyphony & 1024 buffer');
  }

  public async loadSoundFont(sf2Buffer: ArrayBuffer): Promise<number> {
    if (!this.synth) {
      console.log('[FluidSynth] Synth not yet initialized during loadSoundFont. Initializing now...');
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx) {
        await this.init(this.ctx);
      }
    }

    if (!this.synth) {
      throw new Error('Não foi possível inicializar o motor FluidSynth. Verifique se o áudio está liberado no navegador.');
    }

    const sizeMb = (sf2Buffer.byteLength / (1024 * 1024)).toFixed(1);
    console.log(`[FluidSynth] Loading SoundFont binary (${sizeMb} MB)...`);

    // For large banks (> 60 MB, e.g. 491 MB grand pianos), AudioWorklet message port structured clone
    // will fail or run out of memory. Switch directly to Main-Thread Synthesizer with MEMFS access.
    if (this.isWorkletMode && sf2Buffer.byteLength > 60 * 1024 * 1024) {
      console.log(`[FluidSynth] SoundFont is large (${sizeMb} MB). Using Main-Thread Synthesizer for high memory capacity...`);
      await this.fallbackToScriptProcessor();
    }

    // Unload existing bank if one was loaded
    if (this.loadedSFontId !== null) {
      try {
        if ('unloadSFontAsync' in this.synth && typeof (this.synth as any).unloadSFontAsync === 'function') {
          await (this.synth as any).unloadSFontAsync(this.loadedSFontId);
        } else {
          this.synth.unloadSFont(this.loadedSFontId);
        }
      } catch (e) {
        console.warn('[FluidSynth] Could not unload previous soundfont:', e);
      }
      this.loadedSFontId = null;
    }

    let sfontId: number;
    try {
      // Load new soundfont into FluidSynth WASM core
      sfontId = await this.synth.loadSFont(sf2Buffer);
    } catch (err: any) {
      // If AudioWorklet ran out of memory or failed message clone with large files (~500MB),
      // seamlessly fallback to main-thread Synthesizer which has full process memory access.
      if (this.isWorkletMode) {
        console.warn('[FluidSynth] AudioWorklet loadSFont failed. Falling back to Main-Thread Synthesizer...', err);
        await this.fallbackToScriptProcessor();
        sfontId = await this.synth.loadSFont(sf2Buffer);
      } else {
        console.error('[FluidSynth] loadSFont failed on Main-Thread Synthesizer:', err);
        throw err;
      }
    }

    this.loadedSFontId = sfontId;
    console.log(`[FluidSynth] SoundFont loaded into WASM core with ID: ${sfontId}`);

    // Intelligently select the first valid preset from the SoundFont
    let presetSelected = false;
    try {
      if ('getSFontObject' in this.synth && typeof (this.synth as any).getSFontObject === 'function') {
        const sfontObj = await (this.synth as any).getSFontObject(sfontId);
        if (sfontObj) {
          const rawPresets = typeof sfontObj.getPresetIterable === 'function' ? sfontObj.getPresetIterable() : null;
          const presets = rawPresets instanceof Promise ? await rawPresets : (rawPresets ? [...rawPresets] : []);
          if (presets && presets.length > 0) {
            const first = presets[0];
            const bankNum = typeof first.bankNum === 'number' ? first.bankNum : (typeof first.getBankNum === 'function' ? first.getBankNum() : 0);
            const progNum = typeof first.num === 'number' ? first.num : (typeof first.getNum === 'function' ? first.getNum() : 0);
            const presetName = first.name || (typeof first.getName === 'function' ? first.getName() : 'Preset');
            console.log(`[FluidSynth] Auto-selected preset: "${presetName}" (Bank ${bankNum}, Program ${progNum})`);
            try { this.synth.midiBankSelect(0, bankNum); } catch {}
            try { this.synth.midiProgramSelect(0, sfontId, bankNum, progNum); } catch {}
            try { this.synth.midiProgramChange(0, progNum); } catch {}
            presetSelected = true;
          }
        }
      }
    } catch (presetErr) {
      console.warn('[FluidSynth] Preset query note:', presetErr);
    }

    if (!presetSelected) {
      try {
        this.synth.midiBankSelect(0, 0);
        this.synth.midiProgramSelect(0, sfontId, 0, 0);
        this.synth.midiProgramChange(0, 0);
      } catch {}
    }

    // Apply natural acoustic release and warm room reverb to new SoundFont preset
    this.applyEngineDefaults();

    // Prewarm notes {48, 60, 72}
    this.prewarm();

    return sfontId;
  }

  public prewarm() {
    if (!this.synth) return;
    try {
      const prewarmNotes = [48, 60, 72];
      for (const note of prewarmNotes) {
        this.synth.midiNoteOn(0, note, 1);
        this.synth.midiNoteOff(0, note);
      }
    } catch (e) {
      console.warn('[FluidSynth] Prewarm warning:', e);
    }
  }

  public noteOn(channel = 0, note: number, velocity = 96) {
    if (!this.synth) return;
    // Direct note on to channel 0
    this.synth.midiNoteOn(channel, note, Math.min(127, Math.max(1, velocity)));
  }

  public noteOff(channel = 0, note: number) {
    if (!this.synth) return;
    this.synth.midiNoteOff(channel, note);
  }

  public setSustain(channel = 0, isDown: boolean) {
    if (!this.synth) return;
    // Sustain CC64 binary: only 127 or 0 (no intermediate values)
    this.synth.midiControl(channel, 64, isDown ? 127 : 0);
  }

  public allNotesOff(channel = 0) {
    if (!this.synth) return;
    try {
      this.synth.midiAllNotesOff(channel);
    } catch {}
  }

  public panic() {
    if (!this.synth) return;
    try {
      for (let ch = 0; ch < 16; ch++) {
        this.synth.midiAllSoundsOff(ch);
        this.synth.midiAllNotesOff(ch);
        this.synth.midiControl(ch, 64, 0); // Release sustain
      }
      this.synth.midiSystemReset();
    } catch (e) {
      console.warn('[FluidSynth] Panic error:', e);
    }
  }

  public setGain(gain: number) {
    this.currentGain = Math.max(0.01, Math.min(1.5, gain));
    if (this.synth) {
      try {
        this.synth.setGain(this.currentGain);
      } catch {}
    }
  }

  public getGain(): number {
    return this.currentGain;
  }

  public close() {
    if (this.synth) {
      try {
        this.synth.close();
      } catch {}
      this.synth = null;
    }
    if (this.audioNode) {
      try {
        this.audioNode.disconnect();
      } catch {}
      this.audioNode = null;
    }
    this.isInitialized = false;
    this.initPromise = null;
    this.loadedSFontId = null;
  }
}
