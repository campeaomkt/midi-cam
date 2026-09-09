import React from 'react';
import { CameraSettings, KeyboardSettings, MidiDevice } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Zap,
  ZapOff,
  Mic,
  MicOff,
  Grid3X3,
  Settings,
  Piano,
  Type,
  MoveVertical,
  Cable,
  CheckCircle2,
  AlertCircle,
  Music,
  Tablet,
  Smartphone,
} from 'lucide-react';

interface TopHudBarProps {
  cameraSettings: CameraSettings;
  keyboardSettings: KeyboardSettings;
  midiDevices: MidiDevice[];
  isMidiConnected: boolean;
  activeSoundFontName?: string;
  isSustainActive?: boolean;
  deviceLayoutMode?: 'tablet' | 'phone';
  onToggleDeviceLayout?: () => void;
  onToggleSustain?: () => void;
  onUpdateCamera: (settings: Partial<CameraSettings>) => void;
  onUpdateKeyboard: (settings: Partial<KeyboardSettings>) => void;
  onOpenSettings: () => void;
  onOpenTypographyModal: () => void;
  onOpenPositionModal: () => void;
  onOpenSoundFontModal: () => void;
  onRequestMidi: () => void;
}

export const TopHudBar: React.FC<TopHudBarProps> = ({
  cameraSettings,
  keyboardSettings,
  midiDevices,
  isMidiConnected,
  activeSoundFontName,
  isSustainActive = false,
  deviceLayoutMode = 'tablet',
  onToggleDeviceLayout,
  onToggleSustain,
  onUpdateCamera,
  onUpdateKeyboard,
  onOpenSettings,
  onOpenTypographyModal,
  onOpenPositionModal,
  onOpenSoundFontModal,
  onRequestMidi,
}) => {
  return (
    <div id="top-hud-bar" className="w-full flex flex-col gap-2 pt-2 md:pt-3 px-3 md:px-5 z-30 select-none">
      {/* Primary Status HUD Row */}
      <div className="flex items-center justify-between text-xs md:text-sm font-semibold text-white/90 drop-shadow-md">
        {/* Left: Resolution & FPS badges */}
        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => {
              const nextRes = cameraSettings.resolution === '4K' ? '1080P' : cameraSettings.resolution === '1080P' ? '720P' : '4K';
              onUpdateCamera({ resolution: nextRes });
            }}
            className="flex items-baseline gap-0.5 hover:text-white transition cursor-pointer"
          >
            <span className="font-extrabold text-sm md:text-base">{cameraSettings.resolution}</span>
            <span className="text-[10px] md:text-xs text-zinc-400 font-medium">RES</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const nextFps = cameraSettings.fps === 24 ? 30 : cameraSettings.fps === 30 ? 60 : 24;
              onUpdateCamera({ fps: nextFps });
            }}
            className="flex items-baseline gap-0.5 hover:text-white transition cursor-pointer"
          >
            <span className="font-extrabold text-sm md:text-base">{cameraSettings.fps}</span>
            <span className="text-[10px] md:text-xs text-zinc-400 font-medium">FPS</span>
          </button>
        </div>

        {/* Right: PWA Install, Layout Mode Toggle, Flash, Mic, Grid, Settings Icons */}
        <div className="flex items-center gap-2.5 md:gap-3.5 text-white/85">
          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Tablet / Phone Layout Toggle Button */}
          {onToggleDeviceLayout && (
            <button
              type="button"
              id="btn-toggle-layout-mode"
              onClick={onToggleDeviceLayout}
              className={`p-1.5 md:p-2 rounded-full transition active:scale-90 flex items-center gap-1 cursor-pointer ${
                deviceLayoutMode === 'tablet'
                  ? 'text-cyan-400 bg-cyan-400/20 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                  : 'text-zinc-300 hover:text-white bg-black/40'
              }`}
              title={
                deviceLayoutMode === 'tablet'
                  ? 'Modo Tablet / Tela Cheia Ativo (Clique para alternar para moldura de Celular Reels 9:16)'
                  : 'Modo Celular (Clique para expandir para tela cheia de Tablet)'
              }
            >
              {deviceLayoutMode === 'tablet' ? (
                <Tablet className="w-5 h-5 md:w-5.5 md:h-5.5" />
              ) : (
                <Smartphone className="w-5 h-5 md:w-5.5 md:h-5.5" />
              )}
            </button>
          )}

          {/* Flash / Torch */}
          <button
            type="button"
            id="btn-toggle-flash"
            onClick={() => onUpdateCamera({ flashEnabled: !cameraSettings.flashEnabled })}
            className={`p-1.5 md:p-2 rounded-full transition active:scale-90 cursor-pointer ${
              cameraSettings.flashEnabled ? 'text-amber-400 bg-amber-400/20' : 'hover:text-white'
            }`}
            title="Lanterna / Flash"
          >
            {cameraSettings.flashEnabled ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
          </button>

          {/* Microphone */}
          <button
            type="button"
            id="btn-toggle-mic"
            onClick={() => onUpdateCamera({ micEnabled: !cameraSettings.micEnabled })}
            className={`p-1.5 md:p-2 rounded-full transition active:scale-90 cursor-pointer ${
              cameraSettings.micEnabled ? 'text-white' : 'text-rose-400 bg-rose-400/20'
            }`}
            title="Microfone"
          >
            {cameraSettings.micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {/* Grid lines */}
          <button
            type="button"
            id="btn-toggle-grid"
            onClick={() => onUpdateCamera({ gridEnabled: !cameraSettings.gridEnabled })}
            className={`p-1.5 md:p-2 rounded-full transition active:scale-90 cursor-pointer ${
              cameraSettings.gridEnabled ? 'text-cyan-400 bg-cyan-400/20' : 'hover:text-white'
            }`}
            title="Grade de Enquadramento"
          >
            <Grid3X3 className="w-5 h-5" />
          </button>

          {/* Settings Modal */}
          <button
            type="button"
            id="btn-open-settings"
            onClick={onOpenSettings}
            className="p-1.5 md:p-2 rounded-full hover:text-white transition active:scale-90 cursor-pointer"
            title="Configurações"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Secondary Overlay Tool Row (Keyboard, Font, Position, MIDI Indicator) */}
      <div className="flex items-center justify-between text-amber-400 mt-1">
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
          {/* Virtual Keyboard Toggle */}
          <button
            type="button"
            id="btn-toggle-keyboard"
            onClick={() => onUpdateKeyboard({ visible: !keyboardSettings.visible })}
            className={`flex items-center gap-1 transition active:scale-90 ${
              keyboardSettings.visible ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
            }`}
            title="Exibir/Ocultar Teclado"
          >
            <Piano className="w-5 h-5" />
          </button>

          {/* Typography / Aa Button */}
          <button
            type="button"
            id="btn-typography"
            onClick={onOpenTypographyModal}
            className="flex items-center gap-0.5 hover:text-amber-300 text-amber-400 transition active:scale-90"
            title="Estilo da Cifra (Fonte / Cor)"
          >
            <Type className="w-5 h-5" />
            <span className="text-xs font-bold">Aa</span>
          </button>

          {/* Position Anchor */}
          <button
            type="button"
            id="btn-position"
            onClick={onOpenPositionModal}
            className="hover:text-amber-300 text-amber-400 transition active:scale-90"
            title="Posição do Teclado"
          >
            <MoveVertical className="w-5 h-5" />
          </button>

          {/* SoundFont / Timbre (.sf2) Selector */}
          <button
            type="button"
            id="btn-soundfont-modal"
            onClick={onOpenSoundFontModal}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition active:scale-90 cursor-pointer ${
              activeSoundFontName
                ? 'text-amber-300 font-bold bg-amber-400/20 border border-amber-400/40 shadow-sm'
                : 'hover:text-amber-300 text-amber-400'
            }`}
            title="Central de Timbres & Sons"
          >
            <Music className="w-3.5 h-3.5" />
            <span className="text-[10.5px] font-bold tracking-tight truncate max-w-[100px]">
              {activeSoundFontName || 'Piano'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sustain Pedal Indicator & Toggle Button */}
          <button
            type="button"
            id="btn-sustain-pedal"
            onClick={onToggleSustain}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md border transition cursor-pointer active:scale-95 ${
              isSustainActive
                ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'bg-black/50 border-white/15 text-zinc-400 hover:text-zinc-200'
            }`}
            title={isSustainActive ? 'Pedal Sustain Ativo (CC 64)' : 'Pedal Sustain Desativado (Pressione o pedal físico, Barra de Espaço ou toque aqui)'}
          >
            <span className={`w-2 h-2 rounded-full transition-all ${isSustainActive ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span>{isSustainActive ? 'Pedal ON' : 'Pedal OFF'}</span>
          </button>

          {/* MIDI Connection Status Badge */}
          <button
            type="button"
            id="btn-midi-status"
            onClick={onRequestMidi}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md border transition cursor-pointer active:scale-95 ${
              isMidiConnected
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-black/50 border-white/15 text-zinc-300 hover:text-white hover:border-amber-400/40'
            }`}
          >
            <Cable className="w-3.5 h-3.5" />
            {isMidiConnected ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{midiDevices[0]?.name?.slice(0, 14) || 'MIDI Ativo'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-400" />
                <span>Conectar MIDI</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
