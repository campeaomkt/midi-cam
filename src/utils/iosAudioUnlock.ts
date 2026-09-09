/**
 * iOS & Safari Web Audio Unlocker
 *
 * Resolves critical mobile Safari constraints:
 * 1. AudioContext starts in "suspended" state and requires an explicit User Gesture (touch/click).
 * 2. iPhone physical side mute switch (modo silencioso) mutes Web Audio API by default
 *    unless an HTML5 audio element plays, switching AVAudioSession to "Playback" mode.
 * 3. MIDI input events (Web MIDI) do NOT count as User Gestures in iOS WebKit,
 *    so plugging a keyboard via adapter leaves audio suspended unless unlocked beforehand.
 */

// 48-byte minimal valid RIFF PCM WAV (silent)
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let isUnlocked = false;
let audioTag: HTMLAudioElement | null = null;
const listeners: Array<(state: AudioContextState) => void> = [];

export function subscribeAudioState(fn: (state: AudioContextState) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyListeners(state: AudioContextState) {
  listeners.forEach((fn) => fn(state));
}

/**
 * Perform unlock on an active AudioContext
 */
export async function unlockAudioContext(ctx: AudioContext): Promise<boolean> {
  try {
    // 1. Resume AudioContext if suspended
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // 2. Play 1-frame silent Web Audio buffer
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // ignore
    }

    // 3. Play tiny silent HTML5 audio to force iOS into Playback session (bypassing mute switch)
    if (!audioTag) {
      try {
        audioTag = new Audio(SILENT_WAV_BASE64);
        audioTag.setAttribute('playsinline', 'true');
        audioTag.volume = 0.01;
        const p = audioTag.play();
        if (p) p.catch(() => {});
      } catch {
        // ignore
      }
    }

    if (ctx.state === 'running') {
      isUnlocked = true;
      notifyListeners('running');
      return true;
    }
  } catch (err) {
    console.warn('Audio unlock warning:', err);
  }

  notifyListeners(ctx.state);
  return ctx.state === 'running';
}

/**
 * Setup global user interaction listener to auto-unlock on first tap anywhere
 */
export function setupAutoUnlock(getAudioContext: () => AudioContext | null) {
  if (typeof window === 'undefined') return;

  const handleInteraction = () => {
    const ctx = getAudioContext();
    if (ctx) {
      unlockAudioContext(ctx);
      if (ctx.state === 'running') {
        window.removeEventListener('pointerdown', handleInteraction, true);
        window.removeEventListener('touchstart', handleInteraction, true);
        window.removeEventListener('keydown', handleInteraction, true);
      }
    }
  };

  window.addEventListener('pointerdown', handleInteraction, true);
  window.addEventListener('touchstart', handleInteraction, true);
  window.addEventListener('keydown', handleInteraction, true);
}
