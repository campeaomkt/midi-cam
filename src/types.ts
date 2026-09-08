export type FilterType =
  | 'normal'
  | 'cinematic-warm'
  | 'moody-noir'
  | 'neon-cyber'
  | 'vintage-film'
  | 'pastel-soft'
  | 'golden-hour'
  | 'emerald-teal';

export interface FilterPreset {
  id: FilterType;
  name: string;
  description: string;
  cssFilter: string;
  colorGrading: {
    brightness: number; // 0.5 to 1.5 (default 1)
    contrast: number;   // 0.5 to 2.0 (default 1)
    saturate: number;   // 0 to 2.5 (default 1)
    sepia: number;      // 0 to 1 (default 0)
    hueRotate: number;  // -180 to 180 (default 0)
    vignette: number;   // 0 to 1 (default 0)
    tintColor?: string;
    tintOpacity?: number;
  };
}

export interface DetectedChord {
  name: string;             // e.g. "A9sus4"
  root: string;             // "A"
  quality: string;          // "9sus4"
  bass?: string;            // if inverted e.g. "G"
  notes: string[];          // ["A", "D", "E", "B"]
  midiNotes: number[];      // [57, 62, 64, 71]
  confidence: number;       // 0 - 1
  isKnown: boolean;
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export interface VideoRecording {
  id: string;
  url: string;
  blob: Blob;
  duration: number; // in seconds
  timestamp: number;
  thumbnailUrl: string;
  sizeBytes: number;
  filterName: string;
}

export type KeyboardTheme =
  | 'cyan'
  | 'gold'
  | 'neon-purple'
  | 'emerald'
  | 'hot-pink'
  | 'white'
  | string;

export type KeyCount = 25 | 32 | 37 | 44 | 49 | 61 | 64 | 73 | 76 | 88;

export interface KeyboardSettings {
  visible: boolean;
  keyCount: KeyCount; // 25, 32, 37, 44, 49, 61, 64, 73, 76, 88
  octaves: 2 | 3 | 4; // backward compatibility helper
  startOctave: number; // typically 2, 3 or 4 (C2, C3, C4)
  octaveShift?: number; // fine octave offset -2, -1, 0, +1, +2
  heightPreset?: 'slim' | 'normal' | 'compact'; // height profile for overlay
  position: 'top' | 'upper-third' | 'middle' | 'lower-third' | 'bottom';
  theme: KeyboardTheme;
  customColor?: string; // Hex color e.g. #3bf5b0 for complete color customization
  showNoteNames: boolean;
  opacity: number;
  scale: number;
  glowIntensity?: number; // 0 to 100 percentage for key illumination glow
  soundEnabled: boolean;
  synthVolume: number;
  viewMode: 'fit' | 'scroll'; // 'fit' fits entire piano on screen, 'scroll' allows touch navigation
}

export interface CameraSettings {
  facingMode: 'user' | 'environment';
  resolution: '4K' | '1080P' | '720P';
  fps: 24 | 30 | 60;
  zoom: number;
  gridEnabled: boolean;
  micEnabled: boolean;
  flashEnabled: boolean;
}
