import React from 'react';
import { CameraSettings, FilterPreset, FilterType } from '../types';
import { RefreshCw, Sparkles, Film, Disc } from 'lucide-react';

interface BottomControlsProps {
  cameraSettings: CameraSettings;
  isRecording: boolean;
  recordingTimeSeconds: number;
  activeFilter: FilterPreset;
  availableFilters: FilterPreset[];
  lastThumbnailUrl?: string;
  onUpdateCamera: (settings: Partial<CameraSettings>) => void;
  onSelectFilter: (filterId: FilterType) => void;
  onToggleRecording: () => void;
  onFlipCamera: () => void;
  onOpenGallery: () => void;
  onOpenFiltersDrawer: () => void;
}

export const BottomControls: React.FC<BottomControlsProps> = ({
  cameraSettings,
  isRecording,
  recordingTimeSeconds,
  lastThumbnailUrl,
  onUpdateCamera,
  onToggleRecording,
  onFlipCamera,
  onOpenGallery,
  onOpenFiltersDrawer,
}) => {
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const zoomLevels = [0.5, 1, 2, 4];

  return (
    <div id="bottom-camera-controls" className="w-full flex flex-col items-center gap-2 pb-6 px-4 z-30 select-none">
      {/* Zoom Selector Row (matching 0,5 - 1x - 2 - 4 in screenshot) */}
      <div className="flex items-center gap-2 md:gap-3 bg-black/45 backdrop-blur-md px-3 py-1 md:px-4 md:py-1.5 rounded-full border border-white/10 shadow-lg text-xs md:text-sm font-bold">
        {zoomLevels.map((lvl) => {
          const isSelected = cameraSettings.zoom === lvl;
          return (
            <button
              key={lvl}
              type="button"
              id={`btn-zoom-${lvl}`}
              onClick={() => onUpdateCamera({ zoom: lvl })}
              className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full transition-all cursor-pointer ${
                isSelected
                  ? 'text-amber-400 font-extrabold scale-110'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {lvl === 1 ? '1x' : lvl === 0.5 ? '0,5' : `${lvl}`}
            </button>
          );
        })}
      </div>

      {/* Main Bottom Shutter Row */}
      <div className="w-full flex items-center justify-between max-w-sm md:max-w-xl lg:max-w-2xl pt-2 px-2">
        {/* Left: Gallery Thumbnail / Filter Adjustments */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            id="btn-open-gallery"
            onClick={onOpenGallery}
            className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-zinc-900 border-2 border-white/20 overflow-hidden flex items-center justify-center transition active:scale-95 shadow-lg group"
            title="Galeria de Gravações"
          >
            {lastThumbnailUrl ? (
              <img
                src={lastThumbnailUrl}
                alt="Último vídeo"
                className="w-full h-full object-cover group-hover:scale-110 transition duration-200"
              />
            ) : (
              <Film className="w-5 h-5 md:w-6 md:h-6 text-zinc-400 group-hover:text-white" />
            )}
          </button>

          <button
            type="button"
            id="btn-filter-settings"
            onClick={onOpenFiltersDrawer}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-black/50 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-amber-400 transition active:scale-95"
            title="Personalizar Filtros"
          >
            <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>

        {/* Center: Giant Red Shutter Button with Recording Indicator */}
        <div className="flex flex-col items-center">
          {isRecording && (
            <div className="flex items-center gap-1.5 mb-2 bg-rose-600/90 text-white font-mono text-xs md:text-sm font-bold px-2.5 py-0.5 md:px-3 md:py-1 rounded-full shadow-lg animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>REC {formatTime(recordingTimeSeconds)}</span>
            </div>
          )}

          <button
            type="button"
            id="btn-shutter-record"
            onClick={onToggleRecording}
            className={`relative flex items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer ${
              isRecording
                ? 'w-20 h-20 md:w-24 md:h-24 p-2 border-4 border-rose-500 bg-black/40'
                : 'w-20 h-20 md:w-24 md:h-24 p-1.5 border-4 border-white bg-transparent hover:border-zinc-200'
            }`}
            title={isRecording ? 'Parar Gravação' : 'Iniciar Gravação'}
          >
            {isRecording ? (
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-md bg-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.9)] transition-all animate-pulse" />
            ) : (
              <div className="w-full h-full rounded-full bg-rose-600 hover:bg-rose-500 shadow-[0_0_20px_rgba(225,29,72,0.8)] transition-all flex items-center justify-center">
                <Disc className="w-6 h-6 md:w-7 md:h-7 text-white/40 opacity-75" />
              </div>
            )}
          </button>
        </div>

        {/* Right: Camera Flip Button */}
        <div className="w-12 md:w-14 flex justify-end">
          <button
            type="button"
            id="btn-flip-camera"
            onClick={onFlipCamera}
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white hover:bg-black/70 transition active:scale-90 shadow-lg"
            title="Inverter Câmera (Frontal / Traseira)"
          >
            <RefreshCw className="w-5 h-5 md:w-6 md:h-6 transition-transform duration-300 active:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
