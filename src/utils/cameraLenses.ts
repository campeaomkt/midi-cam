/**
 * Utilitários para detecção e alternância de lentes em smartphones (iPhone / Android)
 * Permite selecionar a lente Ultra Wide (0.5x) nativa e aplicar zoom óptico/hardware
 */

export interface CameraLensInfo {
  deviceId: string;
  label: string;
  type: 'ultra-wide' | 'main' | 'telephoto' | 'front' | 'unknown';
}

/**
 * Procura a câmera Ultra Wide (0.5x) no dispositivo (iOS Safari / Android)
 */
export async function findUltraWideCamera(): Promise<MediaDeviceInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');

    // 1. Busca por padrões conhecidos de Ultra Wide em múltiplos idiomas
    const ultraPatterns = [
      /ultra[- ]?wide/i,
      /ultra[- ]?angular/i,
      /ultrawide/i,
      /0\.5x?/i,
      /grand[- ]?angle/i,
      /weitwinkel/i,
    ];

    for (const pattern of ultraPatterns) {
      const found = videoDevices.find((d) => pattern.test(d.label || ''));
      if (found) {
        console.log('[CameraLenses] Ultra Wide camera found by label:', found.label);
        return found;
      }
    }

    // 2. No iOS WebKit, se há múltiplas câmeras traseiras e uma tiver "0.5" ou for identificada
    const backCameras = videoDevices.filter((d) => {
      const lbl = (d.label || '').toLowerCase();
      return lbl.includes('back') || lbl.includes('traseira') || lbl.includes('tras') || lbl.includes('rear');
    });

    if (backCameras.length > 1) {
      // Se houver mais de uma traseira, verifica se alguma tem ultra
      const ultra = backCameras.find((d) => /ultra/i.test(d.label));
      if (ultra) return ultra;
    }
  } catch (err) {
    console.warn('[CameraLenses] Erro ao enumerar câmeras para ultra wide:', err);
  }

  return null;
}

/**
 * Procura a câmera principal 1x (Grande-angular padrão traseira)
 */
export async function findMainBackCamera(): Promise<MediaDeviceInfo | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');

    // Câmera traseira normal (que não é ultra nem tele)
    const main = videoDevices.find((d) => {
      const lbl = (d.label || '').toLowerCase();
      const isBack = lbl.includes('back') || lbl.includes('traseira') || lbl.includes('tras') || lbl.includes('rear');
      const isSpecial =
        lbl.includes('ultra') ||
        lbl.includes('tele') ||
        lbl.includes('0.5') ||
        lbl.includes('2x') ||
        lbl.includes('3x');
      return isBack && !isSpecial;
    });

    if (main) {
      return main;
    }

    // Fallback: primeira câmera traseira encontrada
    const anyBack = videoDevices.find((d) => {
      const lbl = (d.label || '').toLowerCase();
      return lbl.includes('back') || lbl.includes('traseira') || lbl.includes('tras') || lbl.includes('rear');
    });

    return anyBack || null;
  } catch (err) {
    console.warn('[CameraLenses] Erro ao enumerar câmeras traseiras:', err);
  }

  return null;
}

/**
 * Tenta aplicar zoom de hardware direto no sensor através de MediaStreamTrack
 * Disponível em Safari iOS moderno e Chrome Android com suporte a zoom
 */
export async function applyHardwareZoom(
  track: MediaStreamTrack | undefined | null,
  zoomLevel: number
): Promise<boolean> {
  if (!track || typeof track.getCapabilities !== 'function') {
    return false;
  }

  try {
    const capabilities = track.getCapabilities() as unknown as {
      zoom?: { min: number; max: number; step: number };
    };

    if (capabilities && capabilities.zoom) {
      const min = capabilities.zoom.min ?? 1;
      const max = capabilities.zoom.max ?? 1;
      const clampedZoom = Math.max(min, Math.min(max, zoomLevel));

      await track.applyConstraints({
        // @ts-expect-error zoom is supported in modern mobile browsers
        advanced: [{ zoom: clampedZoom }],
      });
      console.log(`[CameraLenses] Hardware zoom applied: ${clampedZoom}x`);
      return true;
    }
  } catch (e) {
    console.warn('[CameraLenses] applyHardwareZoom failed:', e);
  }

  return false;
}
