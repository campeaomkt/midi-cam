/**
 * Polyphonic Piano / Electric Piano Synthesizer with SF2 SoundFont sample playback,
 * Studio Sampled Instruments (Grand Piano, Rhodes, Accordion, Strings, Organ)
 * and Audio Stream mixing for Video Recording
 */

import { sf2Engine } from './sf2Engine';
import { timbreEngine } from './timbreEngine';
import { unlockAudioContext, setupAutoUnlock } from './iosAudioUnlock';

class AudioSynthManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private streamDestination: MediaStreamAudioDestinationNode | null = null;
  private activeVoices: Map<number, { oscillators: OscillatorNode[]; gain: GainNode }> = new Map();
  private isMuted: boolean = false;
  private volume: number = 0.7;

  constructor() {
    // Setup automatic auto-unlock on first user tap/pointerdown
    if (typeof window !== 'undefined') {
      setupAutoUnlock(() => this.ctx);
    }
  }

  public initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Create stream destination for combining with video recording
      this.streamDestination = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.streamDestination);

      // Initialize the timbre engine with this AudioContext and masterGain
      timbreEngine.init(this.ctx, this.masterGain);
    }

    // Unlock context and iOS silent mode
    unlockAudioContext(this.ctx);
  }

  public getAudioContext(): AudioContext {
    this.initContext();
    return this.ctx!;
  }

  public getAudioStreamDestination(): MediaStreamAudioDestinationNode | null {
    this.initContext();
    return this.streamDestination;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public startNote(midiNumber: number, velocity: number = 90) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    // 1. Play through Timbre Engine (Built-in Grand Piano, Rhodes, Accordion, Strings, or custom SF2)
    const handled = timbreEngine.playNote(midiNumber, velocity);
    if (handled) {
      return;
    }

    // 2. Fallback to built-in acoustic/electric piano synthesizer
    this.stopNote(midiNumber);

    const freq = 440 * Math.pow(2, (midiNumber - 69) / 12);
    const now = this.ctx.currentTime;
    const normalizedVel = Math.min(1, Math.max(0.1, velocity / 127));

    // Create a rich dual-oscillator acoustic/electric piano voice
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const oscSub = this.ctx.createOscillator();

    const voiceGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Piano-like harmonics: triangle + sine + subtle sub
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now); // Octave overtone

    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(freq * 0.5, now); // Deep acoustic body

    // Dynamic lowpass filter to emulate hammer strike velocity
    filter.type = 'lowpass';
    const cutoffFreq = Math.min(8000, 1200 + normalizedVel * 4500);
    filter.frequency.setValueAtTime(cutoffFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, cutoffFreq * 0.3), now + 1.2);

    // ADSR Envelope
    const attack = 0.008;
    const decay = 1.4;
    const peakGain = 0.28 * normalizedVel;
    const sustainGain = peakGain * 0.3;

    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(peakGain, now + attack);
    voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainGain), now + decay);

    // Connect oscillators
    const osc1Gain = this.ctx.createGain();
    osc1Gain.gain.value = 0.6;
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.25;
    const oscSubGain = this.ctx.createGain();
    oscSubGain.gain.value = 0.15;

    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    oscSub.connect(oscSubGain);

    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    oscSubGain.connect(filter);

    filter.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    oscSub.start(now);

    this.activeVoices.set(midiNumber, {
      oscillators: [osc1, osc2, oscSub],
      gain: voiceGain,
    });
  }

  public stopNote(midiNumber: number) {
    // 1. Release SF2 sample voice if loaded
    if (sf2Engine.getIsLoaded()) {
      sf2Engine.stopNote(midiNumber, this.ctx || undefined);
    }

    // 2. Release synth voice if sounding
    const voice = this.activeVoices.get(midiNumber);
    if (!voice || !this.ctx) return;

    const now = this.ctx.currentTime;
    const release = 0.35;

    // Smooth release fade out
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

    setTimeout(() => {
      voice.oscillators.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore already stopped
        }
      });
      voice.gain.disconnect();
    }, release * 1000 + 50);

    this.activeVoices.delete(midiNumber);
  }

  public stopAllNotes() {
    if (sf2Engine.getIsLoaded()) {
      sf2Engine.stopAllVoices();
    }
    this.activeVoices.forEach((_, note) => {
      this.stopNote(note);
    });
    this.activeVoices.clear();
  }
}

export const audioSynth = new AudioSynthManager();

