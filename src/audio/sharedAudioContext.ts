/**
 * Single Authoritative Web AudioContext Provider
 * Ensures all synthesizer engines, audio worklets, master nodes, and recording destinations
 * share the exact same AudioContext, eliminating disconnected nodes and suspended context desync.
 */

let sharedContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedContext || sharedContext.state === 'closed') {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    // Do NOT force 48000 Hz sampleRate (respect user rule: "Não forçar 48 kHz no AudioContext do PC Studio")
    // Let browser pick the hardware native sample rate for lowest latency and zero resampling artifacts.
    sharedContext = new AudioCtx({
      latencyHint: 'interactive',
    });

    console.log(
      `[SharedAudioContext] Initialized AudioContext: sampleRate=${sharedContext.sampleRate}Hz, state=${sharedContext.state}`
    );
  }

  return sharedContext;
}

export async function ensureAudioContextRunning(ctx?: AudioContext): Promise<boolean> {
  const target = ctx || getSharedAudioContext();
  if ((target.state as AudioContextState) === 'suspended') {
    try {
      await target.resume();
      console.log(`[SharedAudioContext] Resumed AudioContext: state=${target.state}`);
      return (target.state as AudioContextState) === 'running';
    } catch (e) {
      console.warn('[SharedAudioContext] Failed to resume AudioContext:', e);
      return false;
    }
  }
  return target.state === 'running';
}
