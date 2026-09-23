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

export type KeyboardVisualModel = 'realistic-3d' | 'realistic-acoustic' | 'flat-minimal';

export interface KeyboardSettings {
  visualModel?: KeyboardVisualModel;
  visible: boolean;
  keyCount: KeyCount; // 25, 32, 37, 44, 49, 61, 64, 73, 76, 88
  octaves: 2 | 3 | 4; // backward compatibility helper
  startOctave: number; // typically 2, 3 or 4 (C2, C3, C4)
  octaveShift?: number; // fine octave offset -2, -1, 0, +1, +2
  heightPreset?: 'slim' | 'normal' | 'compact'; // height profile for overlay
  position: 'top' | 'upper-third' | 'middle' | 'lower-third' | 'bottom';
  customYPercent?: number; // Custom drag Y position in percentage (0 - 100)
  chordPlacement?: 'above' | 'below'; // Chord displayed above or below keyboard
  theme: KeyboardTheme;
  customColor?: string; // Hex color e.g. #3bf5b0 for complete color customization
  showNoteNames: boolean;
  opacity: number;
  scale: number;
  glowIntensity?: number; // 0 to 100 percentage for key illumination glow
  soundEnabled: boolean;
  synthVolume: number;
  velocityCurve?: 'natural' | 'soft' | 'hard' | 'fixed'; // MIDI velocity dynamic sensitivity curve
  viewMode: 'fit' | 'scroll'; // 'fit' fits entire piano on screen, 'scroll' allows touch navigation
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
}

export interface CameraSettings {
  facingMode: 'user' | 'environment';
  resolution: '4K' | '1080P' | '720P';
  fps: 24 | 30 | 60;
  zoom: number;
  gridEnabled: boolean;
  micEnabled: boolean;
  flashEnabled: boolean;
  mirrorVideo?: boolean; // whether to flip video horizontally (default true for front mobile, false for desktop USB)
  recordingMode?: 'overlay' | 'direct'; // 'overlay' embeds keyboard & chord into video, 'direct' records raw camera stream for 0% CPU lag
  aspectRatio?: '9:16' | '16:9' | 'auto'; // '9:16' vertical (Reels/TikTok/Shorts), '16:9' widescreen, or 'auto'
  selectedVideoDeviceId?: string; // specific camera device ID
  selectedAudioDeviceId?: string; // specific microphone device ID
  audioRecordSource?: 'keyboard-only' | 'keyboard-and-mic'; // record keyboard only or keyboard + microphone
  micGainLevel?: number; // 0.5 to 4.0 (studio vocal preamp boost, default 2.5)
  keyboardRecordingGainLevel?: number; // 0.2 to 1.5 (studio keyboard mix balance, default 0.65)
}

export type WifiSyncMode = 'idle' | 'host' | 'client';

export interface WifiSyncStatus {
  mode: WifiSyncMode;
  roomCode: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  peerCount: number;
  hostDeviceName?: string;
  latencyMs: number | null;
  error: string | null;
  lastActiveTimestamp?: number;
  isStreamingCamera?: boolean;
  hasRemoteCameraStream?: boolean;
  isUsingRemoteCamera?: boolean;
}
