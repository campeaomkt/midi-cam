/**
 * Polyphonic Piano / Electric Piano Synthesizer with SF2 SoundFont sample playback,
 * Studio Sampled Instruments (Grand Piano, Rhodes, Accordion, Strings, Organ)
 * and Audio Stream mixing for Video Recording
 */

import { SoundFontEngine } from '../audio/SoundFontEngine';
import { getSharedAudioContext, ensureAudioContextRunning } from '../audio/sharedAudioContext';
import { unlockAudioContext, setupAutoUnlock } from './iosAudioUnlock';

class AudioSynthManager {
  private ctx: AudioContext | null = null;
  private soundfontBus: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
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
    if (this.ctx) return;

    this.ctx = getSharedAudioContext();

    // 1. Dedicated SoundFont Bus: Receives pure audio directly from SoundFontEngine (FluidSynth)
    // Completely uncolored, zero filters, zero equalizers, zero compression
    this.soundfontBus = this.ctx.createGain();
    this.soundfontBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // 2. Master Gain for live monitoring (speakers / headphones)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

    // Route soundfont bus directly to live speaker monitor
    this.soundfontBus.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Create stream destination for direct recording
    this.streamDestination = this.ctx.createMediaStreamDestination();
    this.soundfontBus.connect(this.streamDestination);

    // Initialize the FluidSynth SoundFont engine with this AudioContext and soundfontBus
    SoundFontEngine.init(this.ctx, this.soundfontBus).catch((e) => {
      console.warn('SoundFontEngine init warning:', e);
    });

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
    return this.masterGain!;
  }

  public getAudioStreamDestination(): MediaStreamAudioDestinationNode | null {
    this.initContext();
    return this.streamDestination;
  }

  private activeRecordingMicSource: MediaStreamAudioSourceNode | null = null;

  /**
   * Creates a dedicated pure MediaStream for video recording.
   * Completely transparent audio path: No EQ, No compressors, No limiters.
   * Delivers pure, dynamic, authentic sound identical to a professional DAW.
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
    const ctx = this.ctx!;
    const recDest = ctx.createMediaStreamDestination();

    // Ensure SoundFontEngine output node is hooked to soundfontBus
    const sfNode = SoundFontEngine.getOutputNode();
    if (sfNode && this.soundfontBus) {
      try {
        sfNode.connect(this.soundfontBus);
      } catch {}
    }

    const hasMic = Boolean(micStream && micStream.getAudioTracks().length > 0 && micGainMultiplier > 0);
    const hasKeyboard = keyboardGainMultiplier > 0;

    // 1. Direct transparent gain for keyboard audio into the recording destination
    let keyboardRecGain: GainNode | null = null;
    if (hasKeyboard && this.soundfontBus) {
      keyboardRecGain = ctx.createGain();
      keyboardRecGain.gain.setValueAtTime(keyboardGainMultiplier, ctx.currentTime);

      this.soundfontBus.connect(keyboardRecGain);
      keyboardRecGain.connect(recDest);
    }

    // 2. Direct transparent gain for microphone into recording destination
    let micSource: MediaStreamAudioSourceNode | null = null;
    let micGainNode: GainNode | null = null;

    if (hasMic && micStream) {
      try {
        micSource = ctx.createMediaStreamSource(micStream);
        this.activeRecordingMicSource = micSource;

        micGainNode = ctx.createGain();
        micGainNode.gain.setValueAtTime(micGainMultiplier, ctx.currentTime);

        micSource.connect(micGainNode);
        micGainNode.connect(recDest);
      } catch (err) {
        console.warn('Failed to connect mic to recording destination:', err);
      }
    }

    const cleanup = () => {
      try {
        if (keyboardRecGain) {
          if (this.soundfontBus) {
            try {
              this.soundfontBus.disconnect(keyboardRecGain);
            } catch {}
          }
          try {
            keyboardRecGain.disconnect();
          } catch {}
        }
        if (micSource) {
          try {
            micSource.disconnect();
          } catch {}
        }
        if (micGainNode) {
          try {
            micGainNode.disconnect();
          } catch {}
        }
        if (this.activeRecordingMicSource === micSource) {
          this.activeRecordingMicSource = null;
        }
        if (micStream) {
          micStream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {
        // ignore
      }
    };

    return { stream: recDest.stream, cleanup };
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1.5, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
    SoundFontEngine.setVolume(this.volume * 100);
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public setSustain(active: boolean) {
    this.sustainActive = active;
    SoundFontEngine.setSustain(active);
  }

  public startNote(midiNumber: number, velocity: number = 96) {
    this.initContext();

    // SoundFontEngine (FluidSynth) exclusive sound motor.
    // If no .sf2 soundfont is loaded, the application remains completely silent (mute).
    SoundFontEngine.noteOn(midiNumber, velocity);
  }

  public stopNote(midiNumber: number) {
    SoundFontEngine.noteOff(midiNumber);
  }

  public stopAllNotes() {
    SoundFontEngine.panic();
  }
}

export const audioSynth = new AudioSynthManager();

