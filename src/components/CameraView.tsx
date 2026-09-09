import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraSettings, FilterPreset, KeyboardSettings, DetectedChord } from '../types';
import { VirtualKeyboard } from './VirtualKeyboard';
import { ChordDisplay } from './ChordDisplay';
import { getCombinedFilterStyle } from '../utils/filterPresets';
import { CameraOff, Camera, HelpCircle, RefreshCw, Smartphone, Play } from 'lucide-react';
import { IOSPermissionGuideModal } from './IOSPermissionGuideModal';

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
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const [isIOSGuideOpen, setIsIOSGuideOpen] = useState<boolean>(false);
  const [isAttempting, setIsAttempting] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect iOS WebKit environment
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // Initialize Camera for iOS Safari and PWA (pure video, audio: false to prevent iOS recording pill)
  const initCamera = useCallback(async () => {
    setIsAttempting(true);
    setCameraError(null);

    // Stop existing tracks if any
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Câmera não é suportada diretamente neste navegador.');
      setIsAttempting(false);
      return;
    }

    let mediaStream: MediaStream | null = null;
    let lastErrorMsg = '';

    // Step 1: Standard mobile constraints with ideal facingMode
    // CRITICAL: audio is strictly false for preview to prevent iPhone from showing red/orange recording indicators
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

    // Step 3: Pure facingMode constraint (standard for mobile Safari)
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
    videoRef,
    stream,
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

    const tryPlay = () => {
      video
        .play()
        .then(() => {
          setIsVideoPlaying(true);
          setCameraError(null);
        })
        .catch((err) => {
          console.log('Autoplay blocked by iOS until user interaction:', err);
        });
    };

    if (video.readyState >= 2) {
      tryPlay();
    } else {
      video.addEventListener('loadedmetadata', tryPlay, { once: true });
    }

    return () => {
      video.removeEventListener('playing', handlePlaying);
    };
  }, [stream, videoRef]);

  // Initialize camera on mount and when facing mode changes
  useEffect(() => {
    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraSettings.facingMode, cameraSettings.resolution]);

  // Combined CSS filter string
  const cssFilterValue = getCombinedFilterStyle(activeFilter, filterAdjustments);

  // Keyboard vertical positioning mapping
  const positionClasses: Record<KeyboardSettings['position'], string> = {
    top: 'top-14 sm:top-16',
    'upper-third': 'top-[16%] sm:top-[20%]', // Matches user's screenshot layout!
    middle: 'top-[42%] -translate-y-1/2',
    'lower-third': 'bottom-[22%] sm:bottom-[24%]',
    bottom: 'bottom-20 sm:bottom-24',
  };

  // Touch on screen plays video if paused by iOS
  const handleViewportClick = () => {
    if (videoRef.current && stream && videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsVideoPlaying(true))
        .catch(() => {});
    }
  };

  return (
    <div
      id="camera-viewport-container"
      ref={containerRef}
      onClick={handleViewportClick}
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none"
    >
      {/* Permanent Video Element in DOM so ref and srcObject are NEVER null */}
      <div
        className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center transition-transform duration-200"
        style={{
          transform: `scale(${cameraSettings.zoom})`,
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

      {/* Floating Chord Display and Virtual Keyboard Layer */}
      {keyboardSettings.visible && (
        <div
          id="keyboard-and-chord-overlay"
          className={`absolute inset-x-0 z-20 flex flex-col items-center pointer-events-auto transition-all duration-300 ${
            positionClasses[keyboardSettings.position]
          }`}
        >
          {/* Real-time Detected Chord Display (appears only when keys are pressed) */}
          <div className="w-full flex justify-center mb-1 sm:mb-2 min-h-[48px] items-center relative">
            <ChordDisplay
              chord={currentChord}
              fontSize={chordFontSize}
              color={chordColor}
            />
            {isSustainActive && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/50 text-amber-300 text-[10.5px] font-extrabold tracking-wider flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.4)] backdrop-blur-md animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>PEDAL</span>
              </div>
            )}
          </div>

          {/* Virtual Keyboard with crisp straight edges and soft shadow */}
          <div className="w-full flex justify-center">
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
              onNotePlay={onNotePlay}
              onNoteRelease={onNoteRelease}
            />
          </div>
        </div>
      )}
    </div>
  );
};
