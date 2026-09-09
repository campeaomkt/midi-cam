import React from 'react';
import { KeyboardSettings, KeyCount } from '../types';
import { X, Check, Sparkles } from 'lucide-react';
import { KEY_COUNT_OPTIONS } from './VirtualKeyboard';
import { KEYBOARD_COLOR_PALETTE, getEffectiveActiveColor } from '../utils/keyboardColor';

interface TypographyPositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyboardSettings: KeyboardSettings;
  onUpdateKeyboard: (settings: Partial<KeyboardSettings>) => void;
  chordColor: string;
  onChangeChordColor: (color: string) => void;
  chordFontSize: 'medium' | 'large' | 'huge';
  onChangeChordFontSize: (size: 'medium' | 'large' | 'huge') => void;
}

const COLOR_OPTIONS = [
  { hex: '#ffffff', label: 'Branco' },
  { hex: '#38ef7d', label: 'Ciano' },
  { hex: '#fbbf24', label: 'Dourado' },
  { hex: '#f43f5e', label: 'Rosa' },
  { hex: '#38bdf8', label: 'Azul Céu' },
];

export const TypographyPositionModal: React.FC<TypographyPositionModalProps> = ({
  isOpen,
  onClose,
  keyboardSettings,
  onUpdateKeyboard,
  chordColor,
  onChangeChordColor,
  chordFontSize,
  onChangeChordFontSize,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="typography-position-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md md:max-w-2xl lg:max-w-3xl bg-zinc-900 border border-white/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Estilo & Posição do Teclado</h2>
            <p className="text-xs text-zinc-400">Personalize a exibição das cifras e do teclado virtual</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Position Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Posição na Tela
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'top', label: 'Topo' },
              { id: 'upper-third', label: 'Superior (Exemplo)' },
              { id: 'middle', label: 'Centro' },
              { id: 'lower-third', label: 'Inferior' },
              { id: 'bottom', label: 'Rodapé' },
            ].map((pos) => {
              const isSelected = keyboardSettings.position === pos.id;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => onUpdateKeyboard({ position: pos.id as KeyboardSettings['position'] })}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-black border-amber-300 shadow-md font-bold'
                      : 'bg-zinc-800/80 border-white/10 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {pos.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Key Highlight Theme */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Cor de Iluminação das Teclas
            </label>
            <span className="text-[11px] font-mono text-zinc-300 font-bold uppercase">
              {getEffectiveActiveColor(keyboardSettings.theme, keyboardSettings.customColor)}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-2 p-2 rounded-xl bg-zinc-800/60 border border-white/10">
            {KEYBOARD_COLOR_PALETTE.map((theme) => {
              const currentHex = getEffectiveActiveColor(keyboardSettings.theme, keyboardSettings.customColor);
              const isSelected = currentHex.toLowerCase() === theme.hex.toLowerCase();
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => onUpdateKeyboard({ theme: theme.id, customColor: theme.hex })}
                  title={`${theme.name} (${theme.hex})`}
                  className={`aspect-square rounded-lg flex items-center justify-center transition cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-white scale-110 shadow-md z-10'
                      : 'hover:scale-105 opacity-85 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: theme.hex }}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                </button>
              );
            })}
          </div>

          {/* Glow / Brightness Percentage Slider */}
          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-zinc-800/60 border border-white/10 mt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-300">
                  Intensidade do Brilho (Glow)
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400">
                {keyboardSettings.glowIntensity ?? 80}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 font-semibold">0%</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={keyboardSettings.glowIntensity ?? 80}
                onChange={(e) =>
                  onUpdateKeyboard({
                    glowIntensity: parseInt(e.target.value, 10),
                  })
                }
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <span className="text-[10px] text-zinc-500 font-semibold">100%</span>
            </div>
          </div>
        </div>

        {/* Chord Font Size */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Tamanho da Cifra
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'medium', label: 'Médio' },
              { id: 'large', label: 'Grande' },
              { id: 'huge', label: 'Extra Grande' },
            ].map((sz) => {
              const isSelected = chordFontSize === sz.id;
              return (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => onChangeChordFontSize(sz.id as 'medium' | 'large' | 'huge')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md'
                      : 'bg-zinc-800/80 border-white/10 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {sz.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chord Font Color */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Cor do Texto da Cifra
          </label>
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((col) => {
              const isSelected = chordColor.toLowerCase() === col.hex.toLowerCase();
              return (
                <button
                  key={col.hex}
                  type="button"
                  onClick={() => onChangeChordColor(col.hex)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition cursor-pointer ${
                    isSelected ? 'border-amber-400 scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: col.hex }}
                  title={col.label}
                >
                  {isSelected && <Check className="w-5 h-5 text-black" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quantidade de Teclas (32, 49, 61, 73, 76, 88) */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Quantidade de Teclas
            </label>
            <span className="text-xs font-mono text-amber-400 font-bold">
              {keyboardSettings.keyCount || 37} teclas
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEY_COUNT_OPTIONS.map((item) => {
              const isSelected = (keyboardSettings.keyCount || 37) === item.count;
              return (
                <button
                  key={item.count}
                  type="button"
                  onClick={() => onUpdateKeyboard({ keyCount: item.count as KeyCount })}
                  className={`flex flex-col items-start p-2 rounded-lg border text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md'
                      : 'bg-zinc-800/80 border-white/10 text-zinc-200 hover:bg-zinc-700'
                  }`}
                >
                  <span className="text-xs font-extrabold">{item.count} Teclas</span>
                  <span className={`text-[10px] ${isSelected ? 'text-neutral-900' : 'text-zinc-400'}`}>
                    {item.desc}
                  </span>
                  <span className={`text-[9px] font-mono mt-0.5 ${isSelected ? 'text-neutral-800' : 'text-amber-400/80'}`}>
                    {item.range}
                  </span>
                </button>
              );
            })}
          </div>

          {/* If 61+ keys, show View Mode (Fit vs Scroll) */}
          {(keyboardSettings.keyCount || 37) >= 61 && (
            <div className="flex items-center justify-between mt-1 p-2 rounded-lg bg-zinc-800/60 border border-white/10 text-xs">
              <span className="text-zinc-300">Modo de Exibição</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateKeyboard({ viewMode: 'fit' })}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                    keyboardSettings.viewMode !== 'scroll'
                      ? 'bg-amber-400 text-black font-bold'
                      : 'bg-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                >
                  Ajustar à Tela
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateKeyboard({ viewMode: 'scroll' })}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                    keyboardSettings.viewMode === 'scroll'
                      ? 'bg-amber-400 text-black font-bold'
                      : 'bg-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                >
                  Rolagem Tátil
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transposição / Oitava Inicial */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-zinc-400">Oitava Inicial</label>
            <select
              value={keyboardSettings.startOctave}
              onChange={(e) => onUpdateKeyboard({ startOctave: parseInt(e.target.value) })}
              className="bg-zinc-800 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="1">C1 / Grave Profundo</option>
              <option value="2">C2 / Grave</option>
              <option value="3">C3 / Padrão Piano</option>
              <option value="4">C4 / Médio-Agudo</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5 justify-end">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-medium text-zinc-300">Nomes nas Teclas</span>
              <button
                type="button"
                onClick={() => onUpdateKeyboard({ showNoteNames: !keyboardSettings.showNoteNames })}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  keyboardSettings.showNoteNames ? 'bg-amber-400' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    keyboardSettings.showNoteNames ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm transition mt-2 shadow-lg"
        >
          Salvar & Concluir
        </button>
      </div>
    </div>
  );
};
