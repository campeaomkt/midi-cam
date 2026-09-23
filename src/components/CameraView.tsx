import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraSettings, FilterPreset, KeyboardSettings, DetectedChord } from '../types';
import { VirtualKeyboard } from './VirtualKeyboard';
import { ChordDisplay } from './ChordDisplay';
import { getCombinedFilterStyle } from '../utils/filterPresets';
import { CameraOff, Camera, HelpCircle, RefreshCw, Smartphone, Play, Video } from 'lucide-react';
import { IOSPermissionGuideModal } from './IOSPermissionGuideModal';
import { wifiMidiBridge } from '../utils/wifiMidiBridge';
import { findUltraWideCamera, findMainBackCamera, applyHardwareZoom } from '../utils/cameraLenses';

interface CameraViewProps {
  cameraSettings: CameraSettings;
  keyboardSettings: KeyboardSettings;
  activeFilter: FilterPreset;
  filterAdjustments: {
    brightness: number;
    contrast: number;
    saturate: number;
    sepia: number;
    hueRotate: number;
  };
  activeNotes: number[];
  currentChord: DetectedChord | null;
  lastChord: DetectedChord | null;
  chordColor: string;
  chordFontSize: 'medium' | 'large' | 'huge';
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isSustainActive?: boolean;
  onNotePlay: (midi: number) => void;
  onNoteRelease: (midi: number) => void;
  onUpdateKeyboard?: (settings: Partial<KeyboardSettings>) => void;
  onUpdateCamera?: (settings: Partial<CameraSettings>) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  cameraSettings,
  keyboardSettings,
  activeFilter,
  filterAdjustments,
  activeNotes,
  currentChord,
  lastChord,
  chordColor,
  chordFontSize,
  videoRef,
  isSustainActive = false,
  onNotePlay,
  onNoteRelease,
  onUpdateKeyboard,
  onUpdateCamera,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isIOSGuideOpen, setIsIOSGuideOpen] = useState<boolean>(false);
  const [isAttempting, setIsAttempting] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Remote Mobile Camera over Wi-Fi (Modo Iriun Webcam)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(() => wifiMidiBridge.getRemoteCameraStream());
  const [useRemoteCamera, setUseRemoteCamera] = useState<boolean>(true);

  // Local Transmitting Camera (quando este celular está transmitindo pro PC - mantém a tela do celular sempre ativa)
  const [localTransmittingStream, setLocalTransmittingStream] = useState<MediaStream | null>(() =>
    wifiMidiBridge.getLocalCameraStream()
  );
  const [isHardwareZoomActive, setIsHardwareZoomActive] = useState<boolean>(false);

  // Subscribe to local camera stream from Wi-Fi bridge (evita tela preta no celular ao transmitir)
  useEffect(() => {
    const unsub = wifiMidiBridge.subscribeLocalStream((lStream) => {
      console.log('[CameraView] Local transmitting camera stream updated:', !!lStream);
      setLocalTransmittingStream(lStream);
    });
    return unsub;
  }, []);

  // Subscribe to incoming remote video streams from mobile device
  useEffect(() => {
    const unsub = wifiMidiBridge.subscribeRemoteStream((rStream) => {
      console.log('[CameraView] Remote camera stream changed:', !!rStream);
      setRemoteStream(rStream);
      if (rStream) {
        setUseRemoteCamera(true);
      }
    });
    return unsub;
  }, []);

  // When user selects mobile-wifi-camera in Settings, switch to remote camera
  useEffect(() => {
    if (cameraSettings.selectedVideoDeviceId === 'mobile-wifi-camera') {
      setUseRemoteCamera(true);
    }
  }, [cameraSettings.selectedVideoDeviceId]);

  // Detect iOS WebKit environment
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // Initialize Camera for Android Chrome, iOS Safari and PWA
  const initCamera = useCallback(async () => {
    setIsAttempting(true);
    setCameraError(null);

    // Safely stop existing tracks using ref to avoid re-triggering hooks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Câmera não é suportada diretamente neste navegador.');
      setIsAttempting(false);
      return;
    }

    let mediaStream: MediaStream | null = null;
    let lastErrorMsg = '';

    // Step 0: Try specific user-selected camera device if configured
    if (cameraSettings.selectedVideoDeviceId) {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: cameraSettings.selectedVideoDeviceId },
            width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
            height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
          },
          audio: false,
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (devErr1) {
        console.warn('Exact deviceId failed, trying ideal deviceId...', devErr1);
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { ideal: cameraSettings.selectedVideoDeviceId },
              width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
              height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
            },
            audio: false,
          });
        } catch (devErr2) {
          console.warn('Ideal deviceId failed, falling back to facingMode...', devErr2);
        }
      }
    }

    // Step 0.5: On PC / Desktop (e.g. Tauri / Windows WebView), if no device was explicitly chosen,
    // enumerate devices and prioritize real physical webcams over disconnected virtual devices (like Iriun or OBS)
    if (!mediaStream && !cameraSettings.selectedVideoDeviceId && navigator.mediaDevices.enumerateDevices) {
      try {
        const devList = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devList.filter((d) => d.kind === 'videoinput');
        if (videoDevs.length > 0) {
          // Look for a real physical webcam (ignoring virtual drivers like Iriun, OBS, DroidCam, etc.)
          const physicalCam = videoDevs.find((d) => {
            const lbl = (d.label || '').toLowerCase();
            return !lbl.includes('iriun') && !lbl.includes('obs') && !lbl.includes('droidcam') && !lbl.includes('virtual') && !lbl.includes('vcam');
          });

          if (physicalCam && physicalCam.deviceId) {
            try {
              mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: { ideal: physicalCam.deviceId },
                  width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
                  height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
                },
                audio: false,
              });
            } catch {}
          }
        }
      } catch {}
    }

    // Step 0.6: Lente Ultra Wide nativa do iPhone / Android (0.5x)
    if (!mediaStream && !cameraSettings.selectedVideoDeviceId && cameraSettings.zoom <= 0.6 && cameraSettings.facingMode === 'environment') {
      try {
        const ultraCam = await findUltraWideCamera();
        if (ultraCam && ultraCam.deviceId) {
          console.log('[CameraView] Usando lente Ultra Wide nativa do iPhone:', ultraCam.label);
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { ideal: ultraCam.deviceId },
              width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
              height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
            },
            audio: false,
          });
        }
      } catch (ultraErr) {
        console.warn('[CameraView] Falha ao solicitar lente Ultra Wide por deviceId:', ultraErr);
      }

      // Se não obteve por deviceId, solicita com a constraint zoom: 0.5 nativa do Safari iOS
      if (!mediaStream) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              // @ts-expect-error zoom constraint on WebKit / iOS Safari 17+
              zoom: 0.5,
              width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
              height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
            },
            audio: false,
          });
          console.log('[CameraView] Conectado via constraint nativa zoom: 0.5 no WebKit!');
        } catch {}
      }
    }

    // Step 0.7: Câmera traseira principal 1x (ao alternar de volta de 0.5x)
    if (!mediaStream && !cameraSettings.selectedVideoDeviceId && cameraSettings.zoom >= 1 && cameraSettings.facingMode === 'environment') {
      try {
        const mainCam = await findMainBackCamera();
        if (mainCam && mainCam.deviceId) {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { ideal: mainCam.deviceId },
              width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
              height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
            },
            audio: false,
          });
        }
      } catch {}
    }

    // Step 1: Standard mobile constraints with ideal facingMode
    if (!mediaStream) {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: cameraSettings.facingMode },
            width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
            height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
          },
          audio: false,
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1: any) {
        lastErrorMsg = err1?.message || 'Falha ao solicitar resolução ideal';
        console.warn('Strategy 1 failed, trying 720p...', err1);
      }
    }

    // Step 2: 720p fallback
    if (!mediaStream) {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: cameraSettings.facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err2: any) {
        lastErrorMsg = err2?.message || 'Falha em 720p';
        console.warn('Strategy 2 failed, trying simplified facingMode...', err2);
      }
    }

    // Step 3: Pure facingMode constraint (standard for mobile Safari / Chrome)
    if (!mediaStream) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: cameraSettings.facingMode } },
          audio: false,
        });
      } catch (err3: any) {
        lastErrorMsg = err3?.message || 'Falha em facingMode';
        console.warn('Strategy 3 failed, trying simple video: true...', err3);
      }
    }

    // Step 4: Generic video fallback
    if (!mediaStream) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (err4: any) {
        lastErrorMsg = err4?.message || 'Permissão de câmera negada ou indisponível';
        console.warn('Strategy 4 failed:', err4);
      }
    }

    setIsAttempting(false);

    if (!mediaStream) {
      setCameraError(lastErrorMsg || 'Não foi possível acessar o sensor da câmera.');
      setHasPermission(false);
      setIsVideoPlaying(false);
      return;
    }

    streamRef.current = mediaStream;
    setStream(mediaStream);
    setHasPermission(true);

    // Immediately attach stream to video element
    const video = videoRef.current;
    if (video) {
      video.srcObject = mediaStream;
      video.muted = true;
      // @ts-ignore
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      try {
        await video.play();
        setIsVideoPlaying(true);
      } catch (playErr) {
        console.log('Video play waiting for gesture:', playErr);
      }
    }

    // Hardware torch attempt
    const videoTrack = mediaStream.getVideoTracks()[0];
    if (videoTrack && 'getCapabilities' in videoTrack) {
      const capabilities = videoTrack.getCapabilities() as unknown as { torch?: boolean };
      if (capabilities.torch && cameraSettings.flashEnabled) {
        try {
          await videoTrack.applyConstraints({
            // @ts-expect-error torch is valid in mobile browsers
            advanced: [{ torch: cameraSettings.flashEnabled }],
          });
        } catch {
          // torch constraint failed or unsupported
        }
      }
    }
  }, [
    cameraSettings.facingMode,
    cameraSettings.resolution,
    cameraSettings.flashEnabled,
    cameraSettings.selectedVideoDeviceId,
    videoRef,
  ]);

  // Dedicated effect ensuring stream is ALWAYS attached to videoRef and played
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.muted = true;
    // @ts-ignore
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    const handlePlaying = () => {
      setIsVideoPlaying(true);
      setCameraError(null);
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handlePlaying);

    const tryPlay = () => {
      video
        .play()
        .then(() => {
          setIsVideoPlaying(true);
          setCameraError(null);
        })
        .catch((err) => {
          console.log('Autoplay blocked by browser until user interaction:', err);
        });
    };

    if (video.readyState >= 2) {
      tryPlay();
    } else {
      video.addEventListener('loadedmetadata', tryPlay, { once: true });
      video.addEventListener('canplay', tryPlay, { once: true });
    }

    tryPlay();

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handlePlaying);
      video.removeEventListener('loadedmetadata', tryPlay);
      video.removeEventListener('canplay', tryPlay);
    };
  }, [stream, videoRef]);

  // Track if physical ultra wide lens is currently active
  const isUltraWideActiveRef = useRef<boolean>(false);

  // Dynamic lens switcher (0.5x Ultra Wide vs 1x Principal)
  const handleLensSwitchIfNeeded = useCallback(
    async (targetZoom: number) => {
      if (cameraSettings.facingMode !== 'environment' || cameraSettings.selectedVideoDeviceId) {
        return;
      }

      const currentTrack = (streamRef.current || stream)?.getVideoTracks()[0];

      // Caso 1: Usuário escolheu ou pinçou para 0.5x (Ultra Wide)
      if (targetZoom <= 0.6 && !isUltraWideActiveRef.current) {
        // Tenta primeiro aplicar zoom direto no track se suportado (WebKit Safari 17+ / Chrome Android)
        const hwOk = await applyHardwareZoom(currentTrack, 0.5);
        if (hwOk) {
          isUltraWideActiveRef.current = true;
          setIsHardwareZoomActive(true);
          return;
        }

        // Se o track não suportou constraint direto, tenta alternar para o deviceId da câmera Ultra-Wide
        try {
          const ultraCam = await findUltraWideCamera();
          if (ultraCam && ultraCam.deviceId) {
            console.log('[CameraView] Alternando para lente Ultra Wide nativa:', ultraCam.label);
            const newStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { ideal: ultraCam.deviceId },
                width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
                height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
              },
              audio: false,
            });

            if (streamRef.current && streamRef.current !== localTransmittingStream && streamRef.current !== remoteStream) {
              streamRef.current.getTracks().forEach((t) => t.stop());
            }

            streamRef.current = newStream;
            setStream(newStream);
            isUltraWideActiveRef.current = true;
            setIsHardwareZoomActive(true);
            return;
          }
        } catch (err) {
          console.warn('[CameraView] Falha ao trocar para ultra-wide:', err);
        }
      }

      // Caso 2: Usuário voltou para 1.0x ou superior a partir de 0.5x
      else if (targetZoom >= 1.0 && isUltraWideActiveRef.current) {
        const hwOk = await applyHardwareZoom(currentTrack, targetZoom);
        if (hwOk) {
          isUltraWideActiveRef.current = false;
          return;
        }

        try {
          const mainCam = await findMainBackCamera();
          if (mainCam && mainCam.deviceId) {
            console.log('[CameraView] Retornando para lente Principal:', mainCam.label);
            const newStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { ideal: mainCam.deviceId },
                width: { ideal: cameraSettings.resolution === '720P' ? 1280 : 1920 },
                height: { ideal: cameraSettings.resolution === '720P' ? 720 : 1080 },
              },
              audio: false,
            });

            if (streamRef.current && streamRef.current !== localTransmittingStream && streamRef.current !== remoteStream) {
              streamRef.current.getTracks().forEach((t) => t.stop());
            }

            streamRef.current = newStream;
            setStream(newStream);
            isUltraWideActiveRef.current = false;
            applyHardwareZoom(newStream.getVideoTracks()[0], targetZoom);
            return;
          }
        } catch (err) {
          console.warn('[CameraView] Falha ao retornar para câmera principal:', err);
        }
      }
    },
    [cameraSettings.facingMode, cameraSettings.resolution, cameraSettings.selectedVideoDeviceId, localTransmittingStream, remoteStream, stream]
  );

  // Hardware zoom on active track when zoom changes
  useEffect(() => {
    const currentTrack = (streamRef.current || stream)?.getVideoTracks()[0];
    if (!currentTrack) return;

    applyHardwareZoom(currentTrack, cameraSettings.zoom).then((success) => {
      setIsHardwareZoomActive(success);
      if (!success && cameraSettings.zoom <= 0.6) {
        handleLensSwitchIfNeeded(0.5);
      } else if (cameraSettings.zoom >= 1.0) {
        handleLensSwitchIfNeeded(cameraSettings.zoom);
      }
    });
  }, [cameraSettings.zoom, stream, handleLensSwitchIfNeeded]);

  // Initialize camera or swap to remote mobile stream / local transmitting stream
  useEffect(() => {
    if (remoteStream && useRemoteCamera) {
      console.log('[CameraView] Active stream set to Remote Mobile Camera');
      if (streamRef.current && streamRef.current !== remoteStream && streamRef.current !== localTransmittingStream) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = remoteStream;
      setStream(remoteStream);
      setHasPermission(true);
      setCameraError(null);
    } else if (localTransmittingStream) {
      console.log('[CameraView] Active stream set to Local Transmitting Camera (Mobile feed kept alive)');
      if (streamRef.current && streamRef.current !== localTransmittingStream && streamRef.current !== remoteStream) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = localTransmittingStream;
      setStream(localTransmittingStream);
      setHasPermission(true);
      setCameraError(null);
    } else {
      initCamera();
    }

    return () => {
      if (streamRef.current && streamRef.current !== remoteStream && streamRef.current !== localTransmittingStream) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [remoteStream, useRemoteCamera, localTransmittingStream, initCamera]);

  // Combined CSS filter string
  const cssFilterValue = getCombinedFilterStyle(activeFilter, filterAdjustments);

  // Keyboard drag and drop vertical positioning state
  const [isDraggingKeyboard, setIsDraggingKeyboard] = useState<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartPercentRef = useRef<number>(20);

  // Keyboard vertical positioning mapping
  const positionClasses: Record<KeyboardSettings['position'], string> = {
    top: 'top-14 sm:top-16',
    'upper-third': 'top-[16%] sm:top-[20%]', // Matches user's screenshot layout!
    middle: 'top-[42%] -translate-y-1/2',
    'lower-third': 'bottom-[22%] sm:bottom-[24%]',
    bottom: 'bottom-20 sm:bottom-24',
  };

  const handleKeyboardDragStart = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const startY = e.clientY;

    let currentPct = keyboardSettings.customYPercent;
    if (currentPct === undefined) {
      const presetPcts: Record<string, number> = {
        top: 12,
        'upper-third': 20,
        middle: 45,
        'lower-third': 65,
        bottom: 78,
      };
      currentPct = presetPcts[keyboardSettings.position] || 20;
    }
    const startPercent = currentPct;
    let isDragging = false;

    const handlePointerMove = (moveEv: PointerEvent) => {
      const deltaY = moveEv.clientY - startY;
      if (!isDragging && Math.abs(deltaY) > 3) {
        isDragging = true;
        setIsDraggingKeyboard(true);
      }
      if (isDragging) {
        moveEv.preventDefault();
        const deltaPct = (deltaY / containerRect.height) * 100;
        const newPct = Math.max(5, Math.min(82, startPercent + deltaPct));
        onUpdateKeyboard?.({ customYPercent: Math.round(newPct * 10) / 10 });
      }
    };

    const handlePointerUp = () => {
      setIsDraggingKeyboard(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Touch on screen plays video if paused by iOS
  const handleViewportClick = () => {
    if (isPinching) return;
    if (videoRef.current && stream && videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsVideoPlaying(true))
        .catch(() => {});
    }
  };

  // Gestos com os dedos na tela (Pinch to Zoom: aproximar e desaproximar com dois dedos)
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const [pinchZoomDisplay, setPinchZoomDisplay] = useState<number | null>(null);
  const [livePinchScale, setLivePinchScale] = useState<number | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const pinchFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = cameraSettings.zoom || 1;
      setIsPinching(true);
      setPinchZoomDisplay(cameraSettings.zoom || 1);
      setLivePinchScale(cameraSettings.zoom || 1);
      if (pinchFadeTimerRef.current) {
        clearTimeout(pinchFadeTimerRef.current);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null && pinchStartDistRef.current > 0) {
      if (e.cancelable) {
        e.preventDefault();
      }

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = dist / pinchStartDistRef.current;

      // Limites de zoom contínuo: de 0.5x (ultra-wide) até 5.0x
      let calculatedZoom = pinchStartZoomRef.current * factor;
      calculatedZoom = Math.max(0.5, Math.min(5.0, calculatedZoom));

      // Snap suave para 1.0x e 0.5x se estiver bem próximo
      let targetZoom = calculatedZoom;
      if (Math.abs(targetZoom - 1.0) < 0.08) {
        targetZoom = 1.0;
      } else if (Math.abs(targetZoom - 0.5) < 0.06) {
        targetZoom = 0.5;
      }

      const rounded = Math.round(targetZoom * 10) / 10;
      setPinchZoomDisplay(rounded);
      setLivePinchScale(targetZoom);

      if (onUpdateCamera) {
        onUpdateCamera({ zoom: rounded });
      }

      const currentTrack = (streamRef.current || stream)?.getVideoTracks()[0];
      if (currentTrack) {
        applyHardwareZoom(currentTrack, rounded);
      }

      wifiMidiBridge.requestRemoteZoom(rounded);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
      setIsPinching(false);
      setLivePinchScale(null);

      if (pinchFadeTimerRef.current) {
        clearTimeout(pinchFadeTimerRef.current);
      }
      pinchFadeTimerRef.current = setTimeout(() => {
        setPinchZoomDisplay(null);
      }, 1000);
    }
  };

  // Escala visual aplicada na tag video
  // Se estiver em 0.5x com a lente ultra wide nativa ativa, a escala é 1 (enquadramento ultra amplo total)
  // Durante o gesto de pinça ativo, utiliza livePinchScale para resposta instantânea a 60fps
  const effectiveZoom = isPinching && livePinchScale !== null ? livePinchScale : (cameraSettings.zoom ?? 1);
  const visualZoomScale =
    effectiveZoom <= 0.6 && (isHardwareZoomActive || isUltraWideActiveRef.current)
      ? 1
      : isHardwareZoomActive && effectiveZoom >= 1
      ? 1
      : Math.max(1, effectiveZoom);

  return (
    <div
      id="camera-viewport-container"
      ref={containerRef}
      onClick={handleViewportClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ touchAction: 'none' }}
      className={`relative h-full bg-black overflow-hidden flex items-center justify-center select-none ${
        (cameraSettings.aspectRatio || '9:16') === '9:16'
          ? 'w-full max-w-[calc(100vh*9/16)] mx-auto border-x border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]'
          : 'w-full'
      }`}
    >
      {/* Indicador HUD de Zoom em tempo real durante gesto de pinça */}
      {pinchZoomDisplay !== null && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 pointer-events-none transition-all duration-200">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-amber-400/40 shadow-[0_4px_25px_rgba(0,0,0,0.7)] animate-in fade-in zoom-in-95">
            <span className="text-amber-400 font-black text-sm tracking-tight font-mono">
              {pinchZoomDisplay < 1 ? '0.5x' : `${pinchZoomDisplay.toFixed(1)}x`}
            </span>
            <span className="text-[10px] text-zinc-300 font-semibold uppercase tracking-wider">
              {pinchZoomDisplay <= 0.6
                ? 'Ultra Wide'
                : pinchZoomDisplay >= 3
                ? 'Telephoto'
                : pinchZoomDisplay >= 2
                ? '2x Zoom'
                : 'Pinch Zoom'}
            </span>
          </div>
        </div>
      )}

      {/* Permanent Video Element in DOM so ref and srcObject are NEVER null */}
      <div
        className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center"
        style={{
          transform: `scale(${visualZoomScale})`,
          transition: isPinching ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // @ts-ignore
          webkit-playsinline="true"
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraSettings.facingMode === 'user' ? 'scale-x-[-1]' : ''
          } ${isVideoPlaying ? 'opacity-100' : 'opacity-0'}`}
          style={{
            filter: cssFilterValue,
          }}
          onPlay={() => setIsVideoPlaying(true)}
          onPlaying={() => setIsVideoPlaying(true)}
          onCanPlay={() => {
            setIsVideoPlaying(true);
            videoRef.current?.play().catch(() => {});
          }}
        />
      </div>

      {/* Fallback Simulation Canvas when camera is blocked/pending/initializing */}
      {!isVideoPlaying && (
        <div
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#181824] via-[#0d0d14] to-[#050508] p-6 text-center z-10"
          style={{
            filter: cssFilterValue,
          }}
        >
          {/* Simulated ambient studio background with soft warm lighting */}
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.25),transparent_60%)]" />
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_20%_80%,rgba(56,239,125,0.2),transparent_50%)]" />

          <div className="relative z-10 flex flex-col items-center max-w-xs gap-3 p-5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center shadow-inner">
              <CameraOff className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Visualização da Câmera</h3>
              <p className="text-xs text-zinc-300 mt-1">
                {stream
                  ? 'Câmera conectada! Toque no botão abaixo para desbloquear o vídeo no iPhone.'
                  : cameraError
                  ? 'Permissão negada ou restrita nos Ajustes do iPhone.'
                  : 'Iniciando sensor de vídeo...'}
              </p>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              id="btn-retry-camera"
              disabled={isAttempting}
              onClick={async (e) => {
                e.stopPropagation();
                if (stream && videoRef.current) {
                  try {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    setIsVideoPlaying(true);
                    return;
                  } catch (playErr) {
                    console.warn('Play error:', playErr);
                  }
                }
                initCamera();
              }}
              className="w-full mt-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isAttempting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : stream ? (
                <>
                  <Play className="w-4 h-4 fill-black" />
                  <span>Desbloquear Vídeo no iPhone</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 stroke-[2.5]" />
                  <span>Tocar para Iniciar Câmera</span>
                </>
              )}
            </button>

            {/* iPhone / iOS Guide Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsIOSGuideOpen(true);
              }}
              className="w-full py-2 px-3 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition border border-white/10"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Como ativar no iPhone (iOS)</span>
            </button>
          </div>
        </div>
      )}

      {/* iOS Camera & Gallery Permission Guide Modal */}
      <IOSPermissionGuideModal
        isOpen={isIOSGuideOpen}
        onClose={() => setIsIOSGuideOpen(false)}
        onRetryCamera={initCamera}
      />

      {/* Real-time Color Tint Overlay (from film preset) */}
      {activeFilter.colorGrading.tintColor && (
        <div
          className="absolute inset-0 pointer-events-none mix-blend-color"
          style={{
            backgroundColor: activeFilter.colorGrading.tintColor,
            opacity: activeFilter.colorGrading.tintOpacity || 0.1,
          }}
        />
      )}

      {/* Screen Flashlight Effect when enabled */}
      {cameraSettings.flashEnabled && (
        <div className="absolute inset-0 bg-white/20 pointer-events-none mix-blend-screen" />
      )}

      {/* Vignette Overlay from Filter */}
      {activeFilter.colorGrading.vignette > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle, transparent 55%, rgba(0,0,0,${activeFilter.colorGrading.vignette}))`,
          }}
        />
      )}

      {/* Rule-of-Thirds Grid Overlay */}
      {cameraSettings.gridEnabled && (
        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 z-10">
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div className="border-r border-b border-white/20" />
          <div />
        </div>
      )}

      {/* Floating Chord Display and Virtual Keyboard Layer - STATIC, NO LAYOUT SHIFT */}
      {keyboardSettings.visible && (
        <div
          id="keyboard-and-chord-overlay"
          style={
            keyboardSettings.customYPercent !== undefined
              ? { top: `${keyboardSettings.customYPercent}%` }
              : undefined
          }
          className={`absolute inset-x-0 z-20 flex flex-col items-center pointer-events-auto select-none touch-none ${
            keyboardSettings.customYPercent !== undefined
              ? ''
              : positionClasses[keyboardSettings.position]
          }`}
        >
          <div className="relative w-full flex flex-col items-center">
            {/* CHORD ABOVE (Default) */}
            {(keyboardSettings.chordPlacement || 'above') === 'above' && (
              <div className="w-full h-9 sm:h-12 flex items-center justify-center pointer-events-none select-none">
                <ChordDisplay
                  chord={currentChord}
                  fontSize={chordFontSize}
                  color={chordColor}
                  aspectRatio={cameraSettings.aspectRatio}
                />
              </div>
            )}

            {/* Virtual Keyboard: Direct click, hold and drag anywhere on the keyboard to reposition */}
            <div
              id="virtual-keyboard-drag-wrapper"
              onPointerDown={handleKeyboardDragStart}
              className="w-full flex justify-center touch-none select-none cursor-grab active:cursor-grabbing"
              title="Clique, mantenha pressionado e arraste para mudar a posição do teclado"
            >
              <VirtualKeyboard
                activeNotes={activeNotes}
                keyCount={keyboardSettings.keyCount}
                octaves={keyboardSettings.octaves}
                startOctave={keyboardSettings.startOctave}
                octaveShift={keyboardSettings.octaveShift || 0}
                heightPreset={keyboardSettings.heightPreset || 'normal'}
                theme={keyboardSettings.theme}
                customColor={keyboardSettings.customColor}
                glowIntensity={keyboardSettings.glowIntensity ?? 80}
                showNoteNames={keyboardSettings.showNoteNames}
                viewMode={keyboardSettings.viewMode}
                visualModel={keyboardSettings.visualModel || 'realistic-3d'}
                onNotePlay={onNotePlay}
                onNoteRelease={onNoteRelease}
              />
            </div>

            {/* CHORD BELOW (When selected by user in Settings) */}
            {keyboardSettings.chordPlacement === 'below' && (
              <div className="w-full h-9 sm:h-12 flex items-center justify-center pointer-events-none select-none mt-1">
                <ChordDisplay
                  chord={currentChord}
                  fontSize={chordFontSize}
                  color={chordColor}
                  aspectRatio={cameraSettings.aspectRatio}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {/* Remote Camera Stream Indicator / Mode Switcher */}
      {remoteStream && useRemoteCamera && (
        <div className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-cyan-500/60 text-cyan-300 text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.4)] animate-fade-in pointer-events-auto">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>Câmera do Celular (Wi-Fi 60 FPS)</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setUseRemoteCamera(false);
            }}
            className="ml-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-zinc-300 hover:text-white transition cursor-pointer"
            title="Mudar para a webcam do computador"
          >
            Usar Webcam PC
          </button>
        </div>
      )}

      {remoteStream && !useRemoteCamera && (
        <div className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-zinc-700 text-zinc-300 text-xs font-semibold shadow-lg animate-fade-in pointer-events-auto">
          <Camera className="w-3.5 h-3.5 text-amber-400" />
          <span>Webcam Local PC</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setUseRemoteCamera(true);
            }}
            className="ml-1 px-2.5 py-0.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[10px] transition cursor-pointer shadow-sm"
            title="Alternar para a câmera remota do celular"
          >
            Usar Câmera do Celular
          </button>
        </div>
      )}
    </div>
  );
};
