/**
 * Polyphonic Piano / Electric Piano Synthesizer with SF2 SoundFont sample playback,
 * Studio Sampled Instruments (Grand Piano, Rhodes, Accordion, Strings, Organ)
 * and Audio Stream mixing for Video Recording
 */

import { SoundFontEngine } from '../audio/SoundFontEngine';
import { getSharedAudioContext, ensureAudioContextRunning } from '../audio/sharedAudioContext';
import { unlockAudioContext, setupAutoUnlock } from './iosAudioUnlock';
import { wasapiPipeline } from '../audio/wasapiAudioPipeline';

class AudioSynthManager {
  private ctx: AudioContext | null = null;
  private soundfontBus: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.85;
  private sustainActive: boolean = false;

  constructor() {
    // Setup automatic auto-unlock on first user tap/pointerdown
    if (typeof window !== 'undefined') {
      setupAutoUnlock(() => this.ctx);
    }
  }

  public initContext() {
    if (this.ctx && this.soundfontBus) return;

    this.ctx = getSharedAudioContext();
    const pipeline = wasapiPipeline.getPipeline();

    // 1. Dedicated SoundFont Bus: Receives pure audio directly from SoundFontEngine (FluidSynth)
    this.soundfontBus = this.ctx.createGain();
    this.soundfontBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // Route soundfont bus directly into the Windows WASAPI Master Piano Stage
    // (Headroom protection, broadcast limiter & anti-clip soft shaper)
    this.soundfontBus.connect(pipeline.pianoInputBus);

    // Initialize the FluidSynth SoundFont engine with this AudioContext and soundfontBus
    SoundFontEngine.init(this.ctx, this.soundfontBus).catch((e) => {
      console.warn('SoundFontEngine init warning:', e);
    });

    // Sync master volume
    wasapiPipeline.setLiveMasterVolume(this.volume, this.isMuted);

    // Unlock context and iOS silent mode
    unlockAudioContext(this.ctx);
    ensureAudioContextRunning(this.ctx).catch(() => {});
  }

  public getAudioContext(): AudioContext {
    this.initContext();
    return this.ctx!;
  }

  public getSoundfontBus(): GainNode {
    this.initContext();
    return this.soundfontBus!;
  }

  public getMasterGain(): GainNode {
    this.initContext();
    return wasapiPipeline.getPipeline().masterLiveGain;
  }

  public getAudioStreamDestination(): MediaStreamAudioDestinationNode | null {
    this.initContext();
    return wasapiPipeline.getPipeline().recordingDestination;
  }

  /**
   * Creates a dedicated, WASAPI-mastered MediaStream for video recording.
   * Both Piano and Voice pass through the studio brickwall limiter and soft shaper.
   * Completely eliminates clipping, inter-track interference, and ducking.
   */
  public getRecordingAudioStream(
    micStream?: MediaStream | null,
    micGainMultiplier: number = 1.0,
    keyboardGainMultiplier: number = 1.0
  ): {
    stream: MediaStream;
    cleanup: () => void;
  } {
    this.initContext();

    // Configure Piano gain on the WASAPI stage for the recording
    wasapiPipeline.setPianoGain(keyboardGainMultiplier);

    // If microphone is active, route through the dedicated vocal channel strip
    let detachMic: (() => void) | null = null;
    if (micStream && micStream.getAudioTracks().length > 0 && micGainMultiplier > 0) {
      detachMic = wasapiPipeline.attachMicrophone(micStream, micGainMultiplier);
    }

    const cleanup = () => {
      if (detachMic) {
        detachMic();
      }
      // Reset piano gain to nominal 1.0
      wasapiPipeline.setPianoGain(1.0);
    };

    return {
      stream: wasapiPipeline.getRecordingMediaStream(),
      cleanup,
    };
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1.5, vol));
    wasapiPipeline.setLiveMasterVolume(this.volume, this.isMuted);
    SoundFontEngine.setVolume(this.volume * 100);
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    wasapiPipeline.setLiveMasterVolume(this.volume, this.isMuted);
  }

  public setSustain(active: boolean) {
    this.sustainActive = active;
    SoundFontEngine.setSustain(active);
  }

  public startNote(midiNumber: number, velocity: number = 96) {
    this.initContext();
    SoundFontEngine.noteOn(midiNumber, velocity);
  }

  public stopNote(midiNumber: number) {
    SoundFontEngine.noteOff(midiNumber);
  }

  public stopAllNotes() {
    SoundFontEngine.panic();
  }

  public setBufferSize(size: 256 | 512 | 1024 | 2048) {
    SoundFontEngine.setBufferSize(size);
  }
}

export const audioSynth = new AudioSynthManager();

