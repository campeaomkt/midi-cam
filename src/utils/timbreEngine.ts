/**
 * Timbre & SoundFont Engine
 * 
 * Provides:
 * 1. Studio-grade sampled instruments ready with 1 click (Grand Piano, Rhodes, Accordion, Strings, Organ)
 * 2. User .sf2 SoundFont file parsing and playback
 * 3. High-efficiency virtual analog synth fallback
 * 4. Direct routing to video recording audio stream
 */

import Soundfont, { InstrumentName, Player } from 'soundfont-player';
import { sf2Engine } from './sf2Engine';
import { unlockAudioContext } from './iosAudioUnlock';

export type BuiltinInstrumentId =
  | 'acoustic_grand_piano'
  | 'electric_piano_1'
  | 'accordion'
  | 'string_ensemble_1'
  | 'church_organ'
  | 'bright_acoustic_piano';

export interface TimbrePreset {
  id: string;
  name: string;
  category: 'acoustic' | 'electric' | 'traditional' | 'orchestral' | 'synth' | 'custom_sf2';
  icon: string; // emoji or label
  description: string;
  isBuiltinSampled?: boolean;
  soundfontName?: BuiltinInstrumentId;
}

export const BUILTIN_INSTRUMENTS: TimbrePreset[] = [
  {
    id: 'acoustic_grand_piano',
    name: 'Piano de Cauda (Grand Piano)',
    category: 'acoustic',
    icon: '🎹',
    description: 'Amostras acústicas reais de piano de concerto Steinway/Yamaha',
    isBuiltinSampled: true,
    soundfontName: 'acoustic_grand_piano',
  },
  {
    id: 'electric_piano_1',
    name: 'Fender Rhodes (E-Piano)',
    category: 'electric',
    icon: '⚡',
    description: 'Timbre aveludado clássico de piano elétrico vintage',
    isBuiltinSampled: true,
    soundfontName: 'electric_piano_1',
  },
  {
    id: 'accordion',
    name: 'Sanfona / Acordeon',
    category: 'traditional',
    icon: '🪗',
    description: 'Amostras autênticas de acordeon para forró, sertanejo e MPB',
    isBuiltinSampled: true,
    soundfontName: 'accordion',
  },
  {
    id: 'string_ensemble_1',
    name: 'Cordas (Strings Ensemble)',
    category: 'orchestral',
    icon: '🎻',
    description: 'Cordas sinfônicas ricas com sustain aveludado',
    isBuiltinSampled: true,
    soundfontName: 'string_ensemble_1',
  },
  {
    id: 'church_organ',
    name: 'Órgão de Tubos (Church Organ)',
    category: 'acoustic',
    icon: '🏛️',
    description: 'Sonoridade imponente e majestosa de tubos de catedral',
    isBuiltinSampled: true,
    soundfontName: 'church_organ',
  },
  {
    id: 'bright_acoustic_piano',
    name: 'Piano Pop Brilhante',
    category: 'acoustic',
    icon: '✨',
    description: 'Piano acústico moderno com ataque cortante para palco',
    isBuiltinSampled: true,
    soundfontName: 'bright_acoustic_piano',
  },
  {
    id: 'builtin_synth',
    name: 'Sintetizador Integrado',
    category: 'synth',
    icon: '🎛️',
    description: 'Síntese analógica virtual leve que funciona 100% offline sem download',
  },
];

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = Math.abs(midi % 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export type TimbreEngineMode = 'builtin_sampled' | 'custom_sf2' | 'synth';

class TimbreEngine {
  private activeTimbreId: string = 'acoustic_grand_piano';
  private mode: TimbreEngineMode = 'builtin_sampled';
  private playersCache: Map<string, Player> = new Map();
  private activeNotesMap: Map<number, { stop: (when?: number) => void }> = new Map();
  private isLoading: boolean = false;
  private loadingProgress: string = '';
  private ctx: AudioContext | null = null;
  private destinationNode: AudioNode | null = null;
  private listeners: Array<() => void> = [];

  constructor() {
    // Restore preferred timbre from localStorage if available
    try {
      const saved = localStorage.getItem('piano_active_timbre_id');
      if (saved) {
        this.activeTimbreId = saved;
        if (saved === 'custom_sf2') {
          this.mode = 'custom_sf2';
        } else if (saved === 'builtin_synth') {
          this.mode = 'synth';
        } else {
          this.mode = 'builtin_sampled';
        }
      }
    } catch {}
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public init(ctx: AudioContext, destinationNode: AudioNode) {
    this.ctx = ctx;
    this.destinationNode = destinationNode;

    // If active timbre is a sampled one, preload it
    if (this.mode === 'builtin_sampled') {
      this.loadInstrument(this.activeTimbreId);
    }
  }

  public getActiveTimbreId(): string {
    return this.activeTimbreId;
  }

  public getMode(): TimbreEngineMode {
    return this.mode;
  }

  public getIsLoading(): boolean {
    return this.isLoading;
  }

  public getLoadingProgress(): string {
    return this.loadingProgress;
  }

  public getActiveTimbreName(): string {
    if (this.mode === 'custom_sf2') {
      const activePreset = sf2Engine.getActivePreset();
      return activePreset ? `SF2: ${activePreset.name}` : 'SF2 Personalizado';
    }
    const found = BUILTIN_INSTRUMENTS.find((inst) => inst.id === this.activeTimbreId);
    return found ? found.name : 'Piano de Cauda';
  }

  public async setTimbre(timbreId: string): Promise<boolean> {
    this.activeTimbreId = timbreId;
    try {
      localStorage.setItem('piano_active_timbre_id', timbreId);
    } catch {}

    if (timbreId === 'custom_sf2') {
      this.mode = 'custom_sf2';
      this.notify();
      return true;
    }

    if (timbreId === 'builtin_synth') {
      this.mode = 'synth';
      this.notify();
      return true;
    }

    this.mode = 'builtin_sampled';
    this.notify();

    return await this.loadInstrument(timbreId);
  }

  public async loadInstrument(instrumentId: string): Promise<boolean> {
    if (!this.ctx || !this.destinationNode) {
      return false;
    }

    const preset = BUILTIN_INSTRUMENTS.find((p) => p.id === instrumentId);
    if (!preset || !preset.soundfontName) {
      return false;
    }

    if (this.playersCache.has(instrumentId)) {
      this.notify();
      return true;
    }

    this.isLoading = true;
    this.loadingProgress = `Carregando ${preset.name}...`;
    this.notify();

    try {
      // Unlock AudioContext first
      await unlockAudioContext(this.ctx);

      const player = await Soundfont.instrument(
        this.ctx,
        preset.soundfontName as InstrumentName,
        {
          destination: this.destinationNode,
          soundfont: 'MusyngKite',
          format: 'mp3',
        }
      );

      this.playersCache.set(instrumentId, player);
      this.isLoading = false;
      this.loadingProgress = '';
      this.notify();
      return true;
    } catch (err) {
      console.warn(`Failed to load sampled soundfont ${instrumentId}, falling back to synth:`, err);
      this.isLoading = false;
      this.loadingProgress = '';
      this.notify();
      return false;
    }
  }

  /**
   * Play a note
   * Returns true if note was successfully handled by a sampled engine, false if caller should use synth fallback
   */
  public playNote(midiNumber: number, velocity: number = 90): boolean {
    if (!this.ctx || !this.destinationNode) {
      return false;
    }

    // Always ensure audio is unlocked on playback
    unlockAudioContext(this.ctx);

    // 1. Custom SF2 mode
    if (this.mode === 'custom_sf2') {
      if (sf2Engine.getIsLoaded()) {
        const played = sf2Engine.playNote(this.ctx, this.destinationNode, midiNumber, velocity);
        if (played) return true;
      }
    }

    // 2. Built-in sampled instrument mode
    if (this.mode === 'builtin_sampled') {
      const player = this.playersCache.get(this.activeTimbreId);
      if (player) {
        try {
          const noteName = midiToNoteName(midiNumber);
          const normalizedVel = Math.max(0.1, Math.min(1, velocity / 127));
          const now = this.ctx.currentTime;

          // Stop previous instance if sounding
          this.stopNote(midiNumber);

          const node = player.play(noteName, now, {
            gain: Math.pow(normalizedVel, 1.2) * 1.1,
            release: 0.15,
          });

          if (node && typeof node.stop === 'function') {
            this.activeNotesMap.set(midiNumber, {
              stop: (when) => {
                try {
                  node.stop(when);
                } catch {}
              },
            });
          }

          return true;
        } catch (err) {
          console.warn('Soundfont player playback error:', err);
        }
      }
    }

    // 3. Fallback to synth if still loading or if mode === 'synth'
    return false;
  }

  /**
   * Stop a sounding note promptly (when key is released or pedal is lifted)
   */
  public stopNote(midiNumber: number) {
    if (this.mode === 'custom_sf2') {
      sf2Engine.stopNote(midiNumber);
    }

    const active = this.activeNotesMap.get(midiNumber);
    if (active) {
      try {
        if (this.ctx) {
          active.stop(this.ctx.currentTime);
        } else {
          active.stop();
        }
      } catch {}
      this.activeNotesMap.delete(midiNumber);
    }
  }

  /**
   * Silence all sounding voices immediately
   */
  public stopAllNotes() {
    if (this.mode === 'custom_sf2') {
      sf2Engine.stopAllVoices();
    }
    this.activeNotesMap.forEach((active) => {
      try {
        if (this.ctx) {
          active.stop(this.ctx.currentTime);
        } else {
          active.stop();
        }
      } catch {}
    });
    this.activeNotesMap.clear();
  }

  /**
   * Play a brief test chord (C Major 7) to verify sound in UI
   */
  public async playTestChord() {
    if (!this.ctx || !this.destinationNode) return;
    await unlockAudioContext(this.ctx);

    const notes = [60, 64, 67, 71]; // C4, E4, G4, B4
    notes.forEach((midi, idx) => {
      setTimeout(() => {
        this.playNote(midi, 95);
        setTimeout(() => {
          this.stopNote(midi);
        }, 1200);
      }, idx * 140);
    });
  }
}

export const timbreEngine = new TimbreEngine();
