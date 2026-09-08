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
  AlertCircle
} from 'lucide-react';

interface TopHudBarProps {
  cameraSettings: CameraSettings;
  keyboardSettings: KeyboardSettings;
  midiDevices: MidiDevice[];
  isMidiConnected: boolean;
  onUpdateCamera: (settings: Partial<CameraSettings>) => void;
  onUpdateKeyboard: (settings: Partial<KeyboardSettings>) => void;
  onOpenSettings: () => void;
  onOpenTypographyModal: () => void;
  onOpenPositionModal: () => void;
  onRequestMidi: () => void;
}

export const TopHudBar: React.FC<TopHudBarProps> = ({
  cameraSettings,
  keyboardSettings,
  midiDevices,
  isMidiConnected,
  onUpdateCamera,
  onUpdateKeyboard,
  onOpenSettings,
  onOpenTypographyModal,
  onOpenPositionModal,
  onRequestMidi,
}) => {
  return (
    <div id="top-hud-bar" className="w-full flex flex-col gap-2 pt-2 px-3 z-30 select-none">
      {/* Primary Status HUD Row */}
      <div className="flex items-center justify-between text-xs font-semibold text-white/90 drop-shadow-md">
        {/* Left: Resolution & FPS badges */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const nextRes = cameraSettings.resolution === '4K' ? '1080P' : cameraSettings.resolution === '1080P' ? '720P' : '4K';
              onUpdateCamera({ resolution: nextRes });
            }}
            className="flex items-baseline gap-0.5 hover:text-white transition cursor-pointer"
          >
            <span className="font-extrabold text-sm">{cameraSettings.resolution}</span>
            <span className="text-[10px] text-zinc-400 font-medium">RES</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const nextFps = cameraSettings.fps === 24 ? 30 : cameraSettings.fps === 30 ? 60 : 24;
              onUpdateCamera({ fps: nextFps });
            }}
            className="flex items-baseline gap-0.5 hover:text-white transition cursor-pointer"
          >
            <span className="font-extrabold text-sm">{cameraSettings.fps}</span>
            <span className="text-[10px] text-zinc-400 font-medium">FPS</span>
          </button>
        </div>

        {/* Right: PWA Install, Flash, Mic, Grid, Settings Icons */}
        <div className="flex items-center gap-3 text-white/85">
          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Flash / Torch */}
          <button
            type="button"
            id="btn-toggle-flash"
            onClick={() => onUpdateCamera({ flashEnabled: !cameraSettings.flashEnabled })}
            className={`p-1.5 rounded-full transition active:scale-90 ${
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
            className={`p-1.5 rounded-full transition active:scale-90 ${
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
            className={`p-1.5 rounded-full transition active:scale-90 ${
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
            className="p-1.5 rounded-full hover:text-white transition active:scale-90"
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
        </div>

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
  );
};
