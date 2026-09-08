import React from 'react';
import { FilterPreset, FilterType } from '../types';
import { X, RotateCcw, Sliders } from 'lucide-react';

interface FilterSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilter: FilterPreset;
  availableFilters: FilterPreset[];
  onSelectFilter: (id: FilterType) => void;
  adjustments: {
    brightness: number;
    contrast: number;
    saturate: number;
    sepia: number;
    hueRotate: number;
  };
  onUpdateAdjustments: (adj: Partial<{
    brightness: number;
    contrast: number;
    saturate: number;
    sepia: number;
    hueRotate: number;
  }>) => void;
  onResetAdjustments: () => void;
}

export const FilterSettingsDrawer: React.FC<FilterSettingsDrawerProps> = ({
  isOpen,
  onClose,
  activeFilter,
  availableFilters,
  onSelectFilter,
  adjustments,
  onUpdateAdjustments,
  onResetAdjustments,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="filter-settings-drawer"
      className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900/95 backdrop-blur-xl border-t border-white/20 rounded-t-3xl p-5 shadow-2xl flex flex-col gap-4 text-white max-h-[80vh] overflow-y-auto max-w-lg mx-auto"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-base font-bold">Filtros & Gradação de Cor</h3>
            <p className="text-xs text-zinc-400">Ajuste o visual da câmera em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResetAdjustments}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
            title="Redefinir Ajustes"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preset Cards Carousel */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Estilos Pré-definidos</label>
        <div className="grid grid-cols-4 gap-2">
          {availableFilters.map((f) => {
            const isSelected = activeFilter.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFilter(f.id)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-lg scale-105'
                    : 'bg-zinc-800/70 border-white/10 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <span className="text-xs font-semibold leading-tight">{f.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Color Correction Sliders */}
      <div className="flex flex-col gap-3 pt-2">
        <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Calibração Manual</label>

        {/* Brightness */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-semibold">
            <span>Brilho</span>
            <span className="text-amber-400 font-mono">{Math.round(adjustments.brightness * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.05"
            value={adjustments.brightness}
            onChange={(e) => onUpdateAdjustments({ brightness: parseFloat(e.target.value) })}
            className="w-full accent-amber-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Contrast */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-semibold">
            <span>Contraste</span>
            <span className="text-amber-400 font-mono">{Math.round(adjustments.contrast * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.7"
            max="1.8"
            step="0.05"
            value={adjustments.contrast}
            onChange={(e) => onUpdateAdjustments({ contrast: parseFloat(e.target.value) })}
            className="w-full accent-amber-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Saturation */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-semibold">
            <span>Saturação de Cores</span>
            <span className="text-amber-400 font-mono">{Math.round(adjustments.saturate * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="2.2"
            step="0.05"
            value={adjustments.saturate}
            onChange={(e) => onUpdateAdjustments({ saturate: parseFloat(e.target.value) })}
            className="w-full accent-amber-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Warmth (Sepia) */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs font-semibold">
            <span>Aquecimento / Tom Analógico</span>
            <span className="text-amber-400 font-mono">{Math.round(adjustments.sepia * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.02"
            value={adjustments.sepia}
            onChange={(e) => onUpdateAdjustments({ sepia: parseFloat(e.target.value) })}
            className="w-full accent-amber-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm transition mt-1"
      >
        Aplicar Filtro
      </button>
    </div>
  );
};
