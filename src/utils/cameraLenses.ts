/**
 * Utilitários para detecção e alternância de lentes em smartphones (iPhone / Android)
 * Permite selecionar a lente Ultra Wide (0.5x) nativa, aplicar zoom óptico/hardware
 * e suportar gestos com os dedos (Pinch to Zoom: aproximar e desaproximar).
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

    if (videoDevices.length === 0) return null;

    // 1. Busca por padrões conhecidos de Ultra Wide em múltiplos idiomas e convenções
    const ultraPatterns = [
      /ultra[- ]?wide/i,
      /ultra[- ]?angular/i,
      /ultrawide/i,
      /0\.5x?/i,
      /grand[- ]?angle/i,
      /weitwinkel/i,
      /super[- ]?wide/i,
      /wide[- ]?angle/i,
      /camera\s*2/i,
    ];

    for (const pattern of ultraPatterns) {
      const found = videoDevices.find((d) => pattern.test(d.label || ''));
      if (found) {
        console.log('[CameraLenses] Ultra Wide camera found by label:', found.label);
        return found;
      }
    }

    // 2. Filtra todas as câmeras traseiras (environment / back)
    const backCameras = videoDevices.filter((d) => {
      const lbl = (d.label || '').toLowerCase();
      // Se tiver "front" ou "frontal" ou "selfie", não é traseira
      if (lbl.includes('front') || lbl.includes('frontal') || lbl.includes('user') || lbl.includes('selfie')) {
        return false;
      }
      return (
        lbl.includes('back') ||
        lbl.includes('traseira') ||
        lbl.includes('tras') ||
        lbl.includes('rear') ||
        lbl === '' // No iOS Safari sem permissão ou com privacy sandbox, labels podem ser vazias ou idênticas
      );
    });

    // Se houver mais de uma câmera traseira (como no iPhone 11, 12, 13, 14, 15, 16):
    // A câmera 0 é a principal (1x) e a câmera 1 é a Ultra Wide (0.5x)
    if (backCameras.length > 1) {
      // Exclui qualquer uma que explicitamente diga telephoto/zoom ótico distante
      const nonTele = backCameras.filter((d) => !/tele|zoom|3x|5x/i.test(d.label));
      if (nonTele.length > 1) {
        console.log('[CameraLenses] Multiple back cameras detected on iPhone, selecting secondary lens:', nonTele[1].label || nonTele[1].deviceId);
        return nonTele[1];
      }
      return backCameras[1];
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
      const isBack =
        lbl.includes('back') ||
        lbl.includes('traseira') ||
        lbl.includes('tras') ||
        lbl.includes('rear');
      const isSpecial =
        lbl.includes('ultra') ||
        lbl.includes('tele') ||
        lbl.includes('0.5') ||
        lbl.includes('2x') ||
        lbl.includes('3x') ||
        lbl.includes('camera 2');
      return isBack && !isSpecial;
    });

    if (main) {
      return main;
    }

    // Fallback: primeira câmera traseira encontrada
    const anyBack = videoDevices.find((d) => {
      const lbl = (d.label || '').toLowerCase();
      const isFront = lbl.includes('front') || lbl.includes('frontal') || lbl.includes('selfie');
      return !isFront;
    });

    return anyBack || (videoDevices.length > 0 ? videoDevices[0] : null);
  } catch (err) {
    console.warn('[CameraLenses] Erro ao enumerar câmeras traseiras:', err);
  }

  return null;
}

/**
 * Obtém os limites de zoom de hardware suportados pelo sensor atual
 */
export function getTrackZoomCapabilities(track: MediaStreamTrack | undefined | null): {
  supported: boolean;
  min: number;
  max: number;
  step: number;
} {
  if (!track || typeof track.getCapabilities !== 'function') {
    return { supported: false, min: 1, max: 1, step: 0.1 };
  }

  try {
    const caps = track.getCapabilities() as unknown as {
      zoom?: { min: number; max: number; step: number };
    };
    if (caps && caps.zoom) {
      return {
        supported: true,
        min: caps.zoom.min ?? 1,
        max: caps.zoom.max ?? 5,
        step: caps.zoom.step ?? 0.1,
      };
    }
  } catch {}

  return { supported: false, min: 1, max: 1, step: 0.1 };
}

/**
 * Aplica zoom de hardware direto no sensor através de MediaStreamTrack
 * Suportado no Safari iOS (WebKit) e Chrome/Android
 */
export async function applyHardwareZoom(
  track: MediaStreamTrack | undefined | null,
  zoomLevel: number
): Promise<boolean> {
  if (!track) {
    return false;
  }

  // 1. Tenta aplicação direta com restrição avançada (padrão WebKit iOS 16.4+ / 17+)
  try {
    await (track as any).applyConstraints({
      advanced: [{ zoom: zoomLevel }],
    });
    console.log(`[CameraLenses] Hardware zoom applied successfully: ${zoomLevel}x`);
    return true;
  } catch {
    // 2. Se falhar, checa capacidades para fazer clamp dentro dos limites suportados
    try {
      const caps = getTrackZoomCapabilities(track);
      if (caps.supported) {
        const clampedZoom = Math.max(caps.min, Math.min(caps.max, zoomLevel));
        await (track as any).applyConstraints({
          advanced: [{ zoom: clampedZoom }],
        });
        console.log(`[CameraLenses] Clamped hardware zoom applied: ${clampedZoom}x`);
        return true;
      }
    } catch (e2) {
      console.warn('[CameraLenses] applyHardwareZoom failed with capabilities clamp:', e2);
    }
  }

  return false;
}
