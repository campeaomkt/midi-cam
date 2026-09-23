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
  private masterLimiter: DynamicsCompressorNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.55;
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
    this.soundfontBus = this.ctx.createGain();
    this.soundfontBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // 2. Master Gain for live monitoring (speakers / headphones)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

    // Route soundfont bus to live speaker monitor
    this.soundfontBus.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // 3. Gentle studio limiter for streaming monitor
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(6, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.005, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.05, this.ctx.currentTime);
    this.soundfontBus.connect(this.masterLimiter);

    // Create stream destination for combining with video recording
    this.streamDestination = this.ctx.createMediaStreamDestination();
    this.masterLimiter.connect(this.streamDestination);

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
   * Creates a dedicated mixed MediaStream for video recording.
   * Routes the digital SoundFont timbre and/or microphone into the recording destination.
   * Balanced gain staging prevents digital clipping and avoids browser ducking/distortion.
   * Microphone is routed ONLY to the recording stream, avoiding acoustic loop feedback to speakers.
   */
  public getRecordingAudioStream(
    micStream?: MediaStream | null,
    micGainMultiplier: number = 1.0,
    keyboardGainMultiplier: number = 0.85
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

    // Studio Master Peak Limiter on the combined recording output (identical to OBS Master Limiter)
    // Threshold is set to -0.5 dB so video encoders (MP4/WebM) never receive clipped samples.
    const masterLimiter = ctx.createDynamicsCompressor();
    masterLimiter.threshold.setValueAtTime(-0.5, ctx.currentTime);
    masterLimiter.knee.setValueAtTime(0, ctx.currentTime);
    masterLimiter.ratio.setValueAtTime(20, ctx.currentTime);
    masterLimiter.attack.setValueAtTime(0.001, ctx.currentTime);
    masterLimiter.release.setValueAtTime(0.04, ctx.currentTime);
    masterLimiter.connect(recDest);

    // 1. Dedicated gain for keyboard audio into the recording destination:
    // Calibrated so piano sits warmly and solidly in the mix without burying or clipping over voice
    let keyboardRecGain: GainNode | null = null;
    if (hasKeyboard && this.soundfontBus) {
      keyboardRecGain = ctx.createGain();
      const safeKeyboardGain = Math.max(0.05, Math.min(2.5, keyboardGainMultiplier));
      keyboardRecGain.gain.setValueAtTime(safeKeyboardGain, ctx.currentTime);

      this.soundfontBus.connect(keyboardRecGain);
      keyboardRecGain.connect(masterLimiter);
    }

    let micSource: MediaStreamAudioSourceNode | null = null;
    let micHighPass: BiquadFilterNode | null = null;
    let micPreamp: GainNode | null = null;
    let micCompressor: DynamicsCompressorNode | null = null;

    if (hasMic && micStream) {
      try {
        micSource = ctx.createMediaStreamSource(micStream);
        this.activeRecordingMicSource = micSource; // keep reference to prevent GC in Chrome/Safari

        // High-Pass Filter at 80Hz: Removes desk rumble, keybed mechanical thumps, and room hum
        micHighPass = ctx.createBiquadFilter();
        micHighPass.type = 'highpass';
        micHighPass.frequency.setValueAtTime(80, ctx.currentTime);
        micHighPass.Q.setValueAtTime(0.7, ctx.currentTime);

        // Studio Vocal Preamp:
        micPreamp = ctx.createGain();
        const safeMicMultiplier = Math.max(0.1, Math.min(4.0, micGainMultiplier));
        micPreamp.gain.setValueAtTime(safeMicMultiplier, ctx.currentTime);

        // Studio Vocal Leveler / Compressor:
        micCompressor = ctx.createDynamicsCompressor();
        micCompressor.threshold.setValueAtTime(-18, ctx.currentTime);
        micCompressor.knee.setValueAtTime(6, ctx.currentTime);
        micCompressor.ratio.setValueAtTime(3.0, ctx.currentTime);
        micCompressor.attack.setValueAtTime(0.005, ctx.currentTime);
        micCompressor.release.setValueAtTime(0.12, ctx.currentTime);

        // Chain: micSource -> micHighPass -> micPreamp -> micCompressor -> masterLimiter
        micSource.connect(micHighPass);
        micHighPass.connect(micPreamp);
        micPreamp.connect(micCompressor);
        micCompressor.connect(masterLimiter);
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
          try { micSource.disconnect(); } catch {}
        }
        if (micHighPass) {
          try { micHighPass.disconnect(); } catch {}
        }
        if (micPreamp) {
          try { micPreamp.disconnect(); } catch {}
        }
        if (micCompressor) {
          try { micCompressor.disconnect(); } catch {}
        }
        try {
          masterLimiter.disconnect();
        } catch {}
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

