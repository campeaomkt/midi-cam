import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CameraSettings, FilterPreset, KeyboardSettings, DetectedChord } from '../types';
import { VirtualKeyboard } from './VirtualKeyboard';
import { ChordDisplay } from './ChordDisplay';
import { getCombinedFilterStyle } from '../utils/filterPresets';
import { CameraOff, Camera } from 'lucide-react';

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
  onNotePlay,
  onNoteRelease,
  onUpdateKeyboard,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Camera
  const initCamera = useCallback(async () => {
    try {
      setCameraError(null);

      // Stop existing tracks if any
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Câmera não é suportada diretamente neste navegador.');
        return;
      }

      // Constraints based on settings
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: cameraSettings.facingMode,
          width: { ideal: cameraSettings.resolution === '4K' ? 3840 : cameraSettings.resolution === '1080P' ? 1920 : 1280 },
          height: { ideal: cameraSettings.resolution === '4K' ? 2160 : cameraSettings.resolution === '1080P' ? 1080 : 720 },
          frameRate: { ideal: cameraSettings.fps },
        },
        audio: cameraSettings.micEnabled,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
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
    } catch (err: unknown) {
      console.warn('Camera access issue:', err);
      const msg = err instanceof Error ? err.message : 'Permissão da câmera necessária';
      setCameraError(msg);
      setHasPermission(false);
    }
  }, [cameraSettings.facingMode, cameraSettings.resolution, cameraSettings.fps, cameraSettings.micEnabled, cameraSettings.flashEnabled, videoRef]);

  useEffect(() => {
    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraSettings.facingMode, cameraSettings.resolution, cameraSettings.fps]);

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

  return (
    <div
      id="camera-viewport-container"
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none"
    >
      {/* Video Feed */}
      {hasPermission && !cameraError ? (
        <div
          className="relative w-full h-full overflow-hidden flex items-center justify-center transition-transform duration-200"
          style={{
            transform: `scale(${cameraSettings.zoom})`,
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover pointer-events-none transition-[filter] duration-200 ${
              cameraSettings.facingMode === 'user' ? 'scale-x-[-1]' : ''
            }`}
            style={{
              filter: cssFilterValue,
            }}
          />
        </div>
      ) : (
        /* Fallback Simulation Canvas when camera is blocked/pending */
        <div
          className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#181824] via-[#0d0d14] to-[#050508] p-6 text-center"
          style={{
            filter: cssFilterValue,
          }}
        >
          {/* Simulated ambient studio background with soft warm lighting */}
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_50%_40%,rgba(245,158,11,0.25),transparent_60%)]" />
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_20%_80%,rgba(56,239,125,0.2),transparent_50%)]" />

          <div className="relative z-10 flex flex-col items-center max-w-xs gap-3 p-5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <CameraOff className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Visualização da Câmera</h3>
              <p className="text-xs text-zinc-400 mt-1">
                {cameraError
                  ? 'Permita o acesso à câmera no navegador ou continue tocando no teclado interativo abaixo.'
                  : 'Iniciando sensor de vídeo...'}
              </p>
            </div>
            <button
              type="button"
              id="btn-retry-camera"
              onClick={initCamera}
              className="mt-1 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Camera className="w-4 h-4" />
              <span>Ativar Câmera</span>
            </button>
          </div>
        </div>
      )}

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
          <div className="border-r border-white/20" />
          <div className="border-r border-white/20" />
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
          <div className="w-full flex justify-center mb-1 sm:mb-2 min-h-[48px] items-center">
            <ChordDisplay
              chord={currentChord}
              fontSize={chordFontSize}
              color={chordColor}
            />
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
