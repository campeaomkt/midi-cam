import React from 'react';
import { CameraSettings, KeyboardSettings, MidiDevice, WifiSyncStatus } from '../types';
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
  Wifi,
} from 'lucide-react';

interface TopHudBarProps {
  cameraSettings: CameraSettings;
  keyboardSettings: KeyboardSettings;
  midiDevices: MidiDevice[];
  isMidiConnected: boolean;
  activeSoundFontName?: string;
  isSustainActive?: boolean;
  wifiSyncStatus?: WifiSyncStatus;
  onOpenWifiSync?: () => void;
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
  wifiSyncStatus,
  onOpenWifiSync,
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

        {/* Right: Flash, Mic, Grid, Settings Icons */}
        <div className="flex items-center gap-2.5 md:gap-3.5 text-white/85">
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
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 rounded-full transition active:scale-90 cursor-pointer ${
              activeSoundFontName
                ? 'text-amber-300 font-bold bg-amber-400/20 border border-amber-400/40 shadow-sm'
                : 'hover:text-amber-300 text-amber-400'
            }`}
            title="Central de Timbres & Sons"
          >
            <Music className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] sm:text-[10.5px] font-bold tracking-tight truncate max-w-[70px] sm:max-w-[120px]">
              {activeSoundFontName || 'Piano'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Wi-Fi Sync Button (PC ⇄ Celular) */}
          {onOpenWifiSync && (
            <button
              type="button"
              id="btn-wifi-sync"
              onClick={onOpenWifiSync}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-md border transition cursor-pointer active:scale-95 ${
                wifiSyncStatus?.isConnected
                  ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                  : wifiSyncStatus?.mode === 'host'
                  ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                  : 'bg-black/50 border-white/15 text-zinc-300 hover:text-white hover:border-cyan-400/40'
              }`}
              title="Sincronização Wi-Fi (PC ⇄ Celular)"
            >
              <Wifi className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              {wifiSyncStatus?.isConnected ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                  <span className="font-mono text-[11px] font-bold">
                    {wifiSyncStatus.mode === 'host' ? 'Host PC' : `${wifiSyncStatus.latencyMs ?? 4}ms`}
                  </span>
                </span>
              ) : wifiSyncStatus?.mode === 'host' ? (
                <span className="font-mono text-[11px] font-bold text-cyan-300">{wifiSyncStatus.roomCode}</span>
              ) : (
                <span className="whitespace-nowrap text-[11px] font-semibold">Wi-Fi PC</span>
              )}
            </button>
          )}

          {/* MIDI Connection Status Badge */}
          <button
            type="button"
            id="btn-midi-status"
            onClick={onRequestMidi}
            className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 rounded-full text-xs font-medium backdrop-blur-md border transition cursor-pointer active:scale-95 ${
              isMidiConnected
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-black/50 border-white/15 text-zinc-300 hover:text-white hover:border-amber-400/40'
            }`}
          >
            <Cable className="w-3.5 h-3.5 shrink-0" />
            {isMidiConnected ? (
              <span className="flex items-center gap-1 truncate max-w-[85px] sm:max-w-[140px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">{midiDevices[0]?.name?.slice(0, 14) || 'MIDI Ativo'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="whitespace-nowrap">Conectar MIDI</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
