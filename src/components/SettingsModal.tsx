import React, { useId, useState } from 'react';
import { CameraSettings, KeyboardSettings, KeyCount, MidiDevice, WifiSyncStatus, MediaDeviceOption } from '../types';
import {
  X,
  Cable,
  Volume2,
  VolumeX,
  Video,
  RefreshCw,
  CheckCircle2,
  Music,
  Piano,
  Palette,
  Pipette,
  RotateCcw,
  Check,
  Sparkles,
  Smartphone,
  HelpCircle,
  Wifi,
  ArrowRight,
  Zap,
  Sliders,
  Gauge,
  Camera,
  Mic,
  Type,
  ShieldCheck,
} from 'lucide-react';
import { KEY_COUNT_OPTIONS } from './VirtualKeyboard';
import { PWAInstallButton } from './PWAInstallButton';
import { IOSPermissionGuideModal } from './IOSPermissionGuideModal';
import {
  KEYBOARD_COLOR_PALETTE,
  getEffectiveActiveColor,
} from '../utils/keyboardColor';
import { wifiMidiBridge } from '../utils/wifiMidiBridge';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraSettings: CameraSettings;
  keyboardSettings: KeyboardSettings;
  midiDevices: MidiDevice[];
  isMidiConnected: boolean;
  activeSoundFontName?: string;
  wifiSyncStatus?: WifiSyncStatus;
  cameras?: MediaDeviceOption[];
  microphones?: MediaDeviceOption[];
  onRefreshDevices?: () => void;
  onOpenWifiSync?: () => void;
  onOpenSoundFontModal?: () => void;
  onRequestMidi: () => void;
  onUpdateCamera: (settings: Partial<CameraSettings>) => void;
  onUpdateKeyboard: (settings: Partial<KeyboardSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  cameraSettings,
  keyboardSettings,
  midiDevices,
  isMidiConnected,
  activeSoundFontName,
  wifiSyncStatus,
  cameras,
  microphones,
  onRefreshDevices,
  onOpenWifiSync,
  onOpenSoundFontModal,
  onRequestMidi,
  onUpdateCamera,
  onUpdateKeyboard,
}) => {
  const colorInputId = useId();
  const [isIOSGuideOpen, setIsIOSGuideOpen] = useState(false);

  if (!isOpen) return null;

  const currentActiveHex = getEffectiveActiveColor(
    keyboardSettings.theme,
    keyboardSettings.customColor
  );
  const currentPresetMatch = KEYBOARD_COLOR_PALETTE.find(
    (p) => p.hex.toLowerCase() === currentActiveHex.toLowerCase()
  );

  return (
    <div
      id="main-settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-md md:max-w-2xl lg:max-w-3xl bg-zinc-900 border border-white/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Configurações do Gravador</h2>
            <p className="text-xs text-zinc-400">Personalize vídeo, MIDI, áudio e visualização</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: MIDI Device Connection */}
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cable className={`w-5 h-5 ${isMidiConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <h4 className="text-sm font-bold">Controlador / Teclado MIDI</h4>
                <p className="text-xs text-zinc-400">USB-C, Lightning OTG ou Bluetooth</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRequestMidi}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition active:scale-95"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Detectar</span>
            </button>
          </div>

          {midiDevices.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {midiDevices.map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-emerald-500/30 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-semibold text-white">{dev.name}</span>
                      <span className="text-[10px] text-zinc-400 block">{dev.manufacturer}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    Conectado
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-xs text-zinc-400 bg-zinc-900/60 p-2.5 rounded-lg border border-dashed border-white/10">
              Nenhum dispositivo MIDI detectado no momento. Conecte seu teclado via cabo USB/OTG ou use o teclado interativo na tela.
            </div>
          )}
        </div>

        {/* Section 1.5: Wi-Fi MIDI Sync (PC ⇄ Celular) */}
        {onOpenWifiSync && (
          <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    Sincronização Wi-Fi (PC ⇄ Celular)
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                      Sem Cabos
                    </span>
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Toque no PC ou DAW e receba as notas no celular
                  </p>
                </div>
              </div>

              {wifiSyncStatus?.isConnected ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" />
                  {wifiSyncStatus.latencyMs !== null ? `${wifiSyncStatus.latencyMs}ms` : 'Ativo'}
                </span>
              ) : wifiSyncStatus?.mode === 'host' ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                  {wifiSyncStatus.roomCode}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onOpenWifiSync}
              className="w-full py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center justify-between transition cursor-pointer"
            >
              <span>
                {wifiSyncStatus?.isConnected
                  ? `Conectado ao ${wifiSyncStatus.hostDeviceName || 'PC'} (Gerenciar)`
                  : wifiSyncStatus?.mode === 'host'
                  ? 'Transmissor do PC Ativo (Ver QR Code)'
                  : 'Parear com o Computador / Ver QR Code'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Section 2: Audio Synthesis & Volume */}
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Piano className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold">Exibir Teclado Virtual</h4>
                <p className="text-xs text-zinc-400">Ativa a sobreposição das teclas na tela e na gravação</p>
              </div>
            </div>

            <button
              type="button"
              id="btn-toggle-keyboard-visible"
              onClick={() => onUpdateKeyboard({ visible: !keyboardSettings.visible })}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${
                keyboardSettings.visible
                  ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                  : 'bg-zinc-800 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >
              {keyboardSettings.visible ? 'Visível' : 'Oculto'}
            </button>
          </div>
        </div>

        {/* Section 2b: Audio Synthesis & Volume */}
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold">Som do Teclado (Motor FluidSynth SF2)</h4>
                <p className="text-xs text-zinc-400">Toca exclusivamente o timbre .sf2 carregado (mudo sem SoundFont)</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onUpdateKeyboard({ soundEnabled: !keyboardSettings.soundEnabled })}
              className={`p-1.5 rounded-lg border transition ${
                keyboardSettings.soundEnabled
                  ? 'bg-amber-400 text-black border-amber-300 font-bold'
                  : 'bg-zinc-800 text-zinc-400 border-white/10'
              }`}
            >
              {keyboardSettings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {keyboardSettings.soundEnabled && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span>Volume</span>
                <span className="font-mono">{Math.round(keyboardSettings.synthVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={keyboardSettings.synthVolume}
                onChange={(e) => onUpdateKeyboard({ synthVolume: parseFloat(e.target.value) })}
                className="w-full accent-amber-400 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
              />

              {/* SoundFont 2 (.sf2) Manager Trigger */}
              {onOpenSoundFontModal && (
                <div className="mt-2 pt-2.5 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <div>
                      <span className="text-xs font-bold block text-white">Timbres & SoundFont (.sf2)</span>
                      <span className="text-[11px] text-zinc-400 block">
                        {activeSoundFontName && activeSoundFontName !== 'Nenhum SoundFont Ativo'
                          ? `Ativo: ${activeSoundFontName}`
                          : 'Nenhum timbre ativo (Mudo)'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenSoundFontModal}
                    className="px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 hover:text-amber-200 border border-amber-400/30 text-xs font-semibold transition active:scale-95"
                  >
                    Gerenciar Timbres
                  </button>
                </div>
              )}

              {/* Buffer Size & Latency Controls */}
              <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Buffer de Áudio (Latência do Motor)</span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
                    {keyboardSettings.audioBufferSize || 512} fotogramas (
                    {(keyboardSettings.audioBufferSize || 512) === 256
                      ? '~5.3 ms'
                      : (keyboardSettings.audioBufferSize || 512) === 512
                      ? '~10.6 ms'
                      : (keyboardSettings.audioBufferSize || 512) === 1024
                      ? '~21.3 ms'
                      : '~42.6 ms'}
                    )
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Tamanhos menores reduzem o atraso da resposta ao tocar. 512 ou 256 oferecem resposta imediata para teclados MIDI.
                </p>
                <div className="grid grid-cols-4 gap-1.5 mt-0.5">
                  {([
                    { size: 256, label: '256', sub: 'Ultra Baixo (~5ms)' },
                    { size: 512, label: '512', sub: 'Baixo (~10ms)' },
                    { size: 1024, label: '1024', sub: 'Padrão (~21ms)' },
                    { size: 2048, label: '2048', sub: 'Estável (~42ms)' },
                  ] as const).map(({ size, label, sub }) => {
                    const isSelected = (keyboardSettings.audioBufferSize || 512) === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => onUpdateKeyboard({ audioBufferSize: size })}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border transition cursor-pointer text-center ${
                          isSelected
                            ? 'bg-amber-400/20 border-amber-400/70 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.15)] font-bold'
                            : 'bg-zinc-800/80 border-white/5 hover:border-white/20 text-zinc-300'
                        }`}
                      >
                        <span className="text-xs font-mono">{label}</span>
                        <span className="text-[9px] text-zinc-400 leading-tight mt-0.5">{sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Keyboard Keys Configuration (32, 49, 61, 73, 76, 88) */}
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Piano className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold">Quantidade de Teclas</h4>
                <p className="text-xs text-zinc-400">Escolha a extensão do teclado virtual</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400">
              {keyboardSettings.keyCount || 32} teclas •{' '}
              {KEY_COUNT_OPTIONS.find((k) => k.count === (keyboardSettings.keyCount || 32))?.notesStartOn}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {KEY_COUNT_OPTIONS.map((item) => {
              const isSelected = (keyboardSettings.keyCount || 32) === item.count;
              return (
                <button
                  key={item.count}
                  type="button"
                  onClick={() => onUpdateKeyboard({ keyCount: item.count as KeyCount, octaveShift: 0 })}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/50'
                      : 'bg-zinc-900/90 border-white/10 text-zinc-200 hover:bg-zinc-800/90'
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="text-xs font-extrabold">{item.count} Teclas</span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        isSelected
                          ? 'bg-black/20 text-black'
                          : 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
                      }`}
                    >
                      {item.startNote}
                    </span>
                  </div>
                  <span className={`text-[10.5px] mt-1 line-clamp-1 ${isSelected ? 'text-neutral-900 font-semibold' : 'text-zinc-300'}`}>
                    {item.desc}
                  </span>
                  <div className="w-full flex items-center justify-between mt-1 text-[9.5px]">
                    <span className={`font-mono font-bold ${isSelected ? 'text-neutral-800' : 'text-zinc-400'}`}>
                      {item.range}
                    </span>
                    <span className={`text-[8.5px] italic ${isSelected ? 'text-neutral-800' : 'text-zinc-500'}`}>
                      {item.notesStartOn}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Octave Shift / Transposition Alignment Control */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-white/10 text-xs">
            <div>
              <span className="font-semibold text-zinc-200">Ajuste de Oitava (Alinhamento MIDI)</span>
              <p className="text-[10px] text-zinc-400">
                Padrão regulado de fábrica. Ajuste se apertou Octave -/+ no seu controlador físico.
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() =>
                  onUpdateKeyboard({
                    octaveShift: Math.max(-2, (keyboardSettings.octaveShift || 0) - 1),
                  })
                }
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono font-bold text-xs"
                title="Descer uma oitava"
              >
                -1 Oitava
              </button>
              <button
                type="button"
                onClick={() => onUpdateKeyboard({ octaveShift: 0 })}
                className={`px-2.5 py-1 rounded font-mono font-bold text-xs ${
                  (keyboardSettings.octaveShift || 0) === 0
                    ? 'bg-amber-400 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:text-white'
                }`}
                title="Redefinir para o padrão calibrado"
              >
                {(keyboardSettings.octaveShift || 0) === 0
                  ? '0 (Padrão)'
                  : `${(keyboardSettings.octaveShift || 0) > 0 ? '+' : ''}${keyboardSettings.octaveShift} Oit.`}
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateKeyboard({
                    octaveShift: Math.min(2, (keyboardSettings.octaveShift || 0) + 1),
                  })
                }
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono font-bold text-xs"
                title="Subir uma oitava"
              >
                +1 Oitava
              </button>
            </div>
          </div>

          {/* Height Preset Profile */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-zinc-900/70 border border-white/10 text-xs">
            <div>
              <span className="font-semibold text-zinc-200">Altura do Teclado Virtual</span>
              <p className="text-[10px] text-zinc-400">Reduz a altura para não cobrir o enquadramento do vídeo</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
              {(
                [
                  { id: 'slim', label: 'Slim / Fino' },
                  { id: 'compact', label: 'Compacto' },
                  { id: 'normal', label: 'Equilibrado' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onUpdateKeyboard({ heightPreset: preset.id })}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    (keyboardSettings.heightPreset || 'normal') === preset.id
                      ? 'bg-amber-400 text-black font-bold shadow'
                      : 'bg-zinc-800 text-zinc-300 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {(keyboardSettings.keyCount || 37) >= 61 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/70 border border-white/10 text-xs">
              <span className="text-zinc-300">Modo de Exibição</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateKeyboard({ viewMode: 'fit' })}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                    keyboardSettings.viewMode !== 'scroll'
                      ? 'bg-amber-400 text-black font-bold'
                      : 'bg-zinc-800 text-zinc-300 hover:text-white'
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
                      : 'bg-zinc-800 text-zinc-300 hover:text-white'
                  }`}
                >
                  Rolagem Tátil
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section: Modelo Visual do Teclado */}
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold">Modelo Visual do Teclado</h4>
                <p className="text-xs text-zinc-400">
                  Acabamento físico, relevo 3D e face das teclas
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              {(keyboardSettings.visualModel || 'realistic-3d') === 'realistic-3d'
                ? 'Acústico 3D (Lábio Chanfrado)'
                : (keyboardSettings.visualModel === 'realistic-gloss')
                ? 'Gloss Esmaltado'
                : 'Minimal Flat'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {[
              {
                id: 'realistic-3d',
                title: 'Acústico 3D Realista',
                desc: 'Perspectiva isométrica 3D com linhas finas, faces frontais cinzas e teclas pretas extrusionadas',
                badge: 'Recomendado',
              },
              {
                id: 'realistic-gloss',
                title: 'Gloss Esmaltado',
                desc: 'Acabamento brilhante com reflexo e curvatura suave',
                badge: 'Moderno',
              },
              {
                id: 'flat-minimal',
                title: 'Minimal 2D',
                desc: 'Estilo plano tradicional sem relevo',
                badge: 'Clássico',
              },
            ].map((model) => {
              const isSelected = (keyboardSettings.visualModel || 'realistic-3d') === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onUpdateKeyboard({ visualModel: model.id as any })}
                  className={'relative p-3 rounded-xl border text-left flex flex-col justify-between gap-2 transition cursor-pointer ' + (
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400 text-white shadow-[0_0_14px_rgba(245,158,11,0.25)]'
                      : 'bg-zinc-900/80 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={'text-xs font-bold ' + (isSelected ? 'text-amber-300' : 'text-zinc-200')}>
                        {model.title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 font-semibold">
                        {model.badge}
                      </span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-zinc-400">
                      {model.desc}
                    </p>
                  </div>

                  {/* Micro Visual Preview */}
                  <div className="w-full h-4 rounded overflow-hidden flex items-stretch border border-white/15 mt-1 bg-black">
                    <div className="flex-1 h-full bg-white flex flex-col justify-between border-r border-[#1c1c1f]">
                      {model.id === 'realistic-acoustic' && <div className="h-[2px] bg-red-700/80 w-full" />}
                      <div className="flex-1" />
                      {model.id === 'realistic-3d' && (
                        <div className="h-1.5 bg-[#8f929b] w-full border-t border-[#1c1c1f]" />
                      )}
                    </div>
                    <div className={`w-2.5 h-[65%] -mx-1 z-10 flex flex-col ${model.id === 'realistic-3d' ? 'bg-[#25262a] border border-[#141416]' : 'bg-black border-x border-neutral-700 rounded-b-[1px]'}`}>
                      {model.id === 'realistic-3d' && (
                        <>
                          <div className="flex-1" />
                          <div className="h-1 bg-[#0c0d0f] w-full" />
                        </>
                      )}
                    </div>
                    <div className="flex-1 h-full bg-white flex flex-col justify-between border-r border-[#1c1c1f]">
                      {model.id === 'realistic-acoustic' && <div className="h-[2px] bg-red-700/80 w-full" />}
                      <div className="flex-1" />
                      {model.id === 'realistic-3d' && (
                        <div className="h-1.5 bg-[#8f929b] w-full border-t border-[#1c1c1f]" />
                      )}
                    </div>
                    <div className="w-2.5 h-[65%] -mx-1 z-10 flex flex-col ${model.id === 'realistic-3d' ? 'bg-[#25262a] border border-[#141416]' : 'bg-black border-x border-neutral-700 rounded-b-[1px]'}">
                      {model.id === 'realistic-3d' && (
                        <>
                          <div className="flex-1" />
                          <div className="h-1 bg-[#0c0d0f] w-full" />
                        </>
                      )}
                    </div>
                    <div className="flex-1 h-full bg-white flex flex-col justify-between">
                      {model.id === 'realistic-acoustic' && <div className="h-[2px] bg-red-700/80 w-full" />}
                      <div className="flex-1" />
                      {model.id === 'realistic-3d' && (
                        <div className="h-1.5 bg-[#8f929b] w-full border-t border-[#1c1c1f]" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section: Posição da Cifra em Relação ao Teclado */}
        <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold text-white">Posição da Cifra no Teclado</h4>
                <p className="text-xs text-zinc-400">Escolha onde o nome do acorde será exibido</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20">
              {(keyboardSettings.chordPlacement || 'above') === 'above' ? '▲ Em Cima' : '▼ Em Baixo'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              id="btn-settings-chord-above"
              onClick={() => onUpdateKeyboard({ chordPlacement: 'above' })}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                (keyboardSettings.chordPlacement || 'above') === 'above'
                  ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-extrabold">▲ Em Cima do Teclado</span>
              </div>
              <span className={`text-[10px] leading-tight ${
                (keyboardSettings.chordPlacement || 'above') === 'above' ? 'text-black/80 font-medium' : 'text-zinc-400'
              }`}>
                A cifra flutua centralizada logo acima das teclas do piano
              </span>
            </button>

            <button
              type="button"
              id="btn-settings-chord-below"
              onClick={() => onUpdateKeyboard({ chordPlacement: 'below' })}
              className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                keyboardSettings.chordPlacement === 'below'
                  ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-extrabold">▼ Em Baixo do Teclado</span>
              </div>
              <span className={`text-[10px] leading-tight ${
                keyboardSettings.chordPlacement === 'below' ? 'text-black/80 font-medium' : 'text-zinc-400'
              }`}>
                A cifra aparece na parte inferior, logo abaixo das teclas
              </span>
            </button>
          </div>
        </div>

        {/* Section: Keyboard Animation Color / Paleta Completa de Cores */}
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold">Cor da Animação do Teclado</h4>
                <p className="text-xs text-zinc-400">
                  Iluminação das teclas ativas ao tocar
                </p>
              </div>
            </div>

            {/* Current Active Color Preview Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-white/15 shadow-inner">
              <span
                className="w-3.5 h-3.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)] ring-1 ring-white/20"
                style={{ backgroundColor: currentActiveHex }}
              />
              <span className="text-[11px] font-mono font-bold text-zinc-200 uppercase">
                {currentActiveHex}
              </span>
            </div>
          </div>

          {/* Palette Grid (18 rich colors) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                Paleta Completa de Cores
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateKeyboard({
                    theme: 'cyan',
                    customColor: '#3bf5b0',
                  })
                }
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-300 transition cursor-pointer"
                title="Redefinir para o tom padrão (#3bf5b0)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Padrão (#3bf5b0)</span>
              </button>
            </div>

            <div className="grid grid-cols-6 gap-2 p-2.5 rounded-xl bg-zinc-900/80 border border-white/10">
              {KEYBOARD_COLOR_PALETTE.map((item) => {
                const isSelected =
                  currentActiveHex.toLowerCase() === item.hex.toLowerCase();
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onUpdateKeyboard({
                        theme: item.id,
                        customColor: item.hex,
                      })
                    }
                    title={`${item.name} (${item.hex})`}
                    className={`group relative aspect-square rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'ring-2 ring-white scale-110 shadow-[0_0_14px_rgba(255,255,255,0.6)] z-10'
                        : 'hover:scale-105 opacity-90 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: item.hex }}
                  >
                    {isSelected && (
                      <Check className="w-4 h-4 text-black drop-shadow-sm stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>
            {currentPresetMatch && (
              <span className="text-[11px] text-zinc-400 text-center">
                Selecionado:{' '}
                <strong className="text-zinc-200">{currentPresetMatch.name}</strong>
              </span>
            )}
          </div>

          {/* Custom Color Picker (Hex / Spectrum) */}
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs">
            <div className="flex items-center gap-2">
              <Pipette className="w-4 h-4 text-zinc-400" />
              <div>
                <span className="font-semibold text-zinc-200 block">
                  Seletor Livre de Cor (Hex / RGB)
                </span>
                <span className="text-[10px] text-zinc-400">
                  Escolha qualquer tom personalizado no espectro
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor={colorInputId}
                className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/30 cursor-pointer shadow-sm hover:scale-105 transition shrink-0"
                style={{ backgroundColor: currentActiveHex }}
                title="Abrir seletor de cores"
              >
                <input
                  id={colorInputId}
                  type="color"
                  value={currentActiveHex}
                  onChange={(e) =>
                    onUpdateKeyboard({
                      customColor: e.target.value,
                      theme: e.target.value,
                    })
                  }
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </label>

              <input
                type="text"
                maxLength={7}
                value={keyboardSettings.customColor || currentActiveHex}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('#') && (val.length === 4 || val.length === 7)) {
                    onUpdateKeyboard({ customColor: val, theme: val });
                  } else if (!val.startsWith('#') && val.length > 0) {
                    onUpdateKeyboard({ customColor: `#${val}`, theme: `#${val}` });
                  }
                }}
                placeholder="#3BF5B0"
                className="w-20 px-2 py-1 bg-zinc-800 border border-white/15 rounded-md text-xs font-mono font-bold text-center uppercase focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Glow / Brightness Percentage Slider */}
          <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-zinc-900/80 border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="font-semibold text-xs text-zinc-200 block">
                    Porcentagem de Brilho da Iluminação (Glow)
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Regule a intensidade da aura luminosa ao redor das teclas
                  </span>
                </div>
              </div>

              {/* Percentage Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 border border-white/15">
                <span
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    backgroundColor: currentActiveHex,
                    boxShadow:
                      (keyboardSettings.glowIntensity ?? 80) > 0
                        ? `0 0 8px ${currentActiveHex}`
                        : 'none',
                    opacity:
                      (keyboardSettings.glowIntensity ?? 80) === 0
                        ? 0.4
                        : (keyboardSettings.glowIntensity ?? 80) / 100,
                  }}
                />
                <span className="text-xs font-mono font-bold text-amber-400">
                  {keyboardSettings.glowIntensity ?? 80}%
                </span>
              </div>
            </div>

            {/* Slider Bar */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] text-zinc-400 font-semibold shrink-0">0%</span>
              <div className="relative flex-1 flex items-center">
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
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-amber-400 bg-zinc-800"
                />
              </div>
              <span className="text-[10px] text-zinc-400 font-semibold shrink-0">100%</span>
            </div>

            {/* Quick Percentage Presets */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {[
                { label: '0% (Fosco)', val: 0 },
                { label: '25%', val: 25 },
                { label: '50%', val: 50 },
                { label: '75%', val: 75 },
                { label: '100% (Máx)', val: 100 },
              ].map((item) => {
                const isCurrent = (keyboardSettings.glowIntensity ?? 80) === item.val;
                return (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => onUpdateKeyboard({ glowIntensity: item.val })}
                    className={`py-1 rounded-md text-[10px] font-semibold transition cursor-pointer text-center ${
                      isCurrent
                        ? 'bg-amber-400 text-black font-bold shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section: Dispositivos de Câmera & Microfone e Fonte de Áudio */}
        <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold text-white">Dispositivos & Áudio da Gravação</h4>
                <p className="text-xs text-zinc-400">Escolha a câmera, microfone e fonte sonora do vídeo</p>
              </div>
            </div>
            {onRefreshDevices && (
              <button
                type="button"
                id="btn-refresh-media-devices"
                onClick={onRefreshDevices}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
                title="Detectar novos microfones e câmeras conectados"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold">Atualizar</span>
              </button>
            )}
          </div>

          {/* Seleção de Câmera */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="select-camera-device" className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-zinc-400" />
                <span>Câmera Ativa</span>
              </div>
              <span className="text-[10px] text-zinc-400">
                {cameras && cameras.length > 0 ? `${cameras.length} disponível(is)` : 'Padrão do sistema'}
              </span>
            </label>
            <select
              id="select-camera-device"
              value={cameraSettings.selectedVideoDeviceId || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'mobile-wifi-camera') {
                  if (wifiSyncStatus?.isConnected) {
                    wifiMidiBridge.requestRemoteStartCamera('environment', '1080P');
                  } else if (onOpenWifiSync) {
                    onOpenWifiSync();
                  }
                }
                onUpdateCamera({ selectedVideoDeviceId: val || undefined });
              }}
              className="w-full bg-zinc-900 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="">Câmera Automática / Padrão ({cameraSettings.facingMode === 'user' ? 'Frontal' : 'Traseira'})</option>
              <option value="mobile-wifi-camera">📱 Câmera Wi-Fi do Celular (Modo Iriun Webcam)</option>
              {cameras && cameras.map((cam, idx) => {
                const isVirtual = /iriun|obs|droidcam|virtual|vcam/i.test(cam.label || '');
                return (
                  <option key={cam.deviceId || idx} value={cam.deviceId}>
                    {cam.label || `Câmera ${idx + 1}`} {isVirtual ? '(Virtual)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* DEDICATED CARD: Usar Celular como Webcam (Modo Iriun Webcam) */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-zinc-900/60 to-black/80 border border-cyan-500/40 space-y-3 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>Câmera do Celular como Webcam</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                      Modo Iriun Wi-Fi
                    </span>
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">
                    Transmita a câmera de alta definição do celular sem fios direto para a tela do PC
                  </p>
                </div>
              </div>

              {wifiSyncStatus?.hasRemoteCameraStream && (
                <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 text-[10px] font-bold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  HD 60 FPS Ativo
                </span>
              )}
            </div>

            {wifiSyncStatus?.hasRemoteCameraStream ? (
              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-black/50 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between">
                  <span className="text-[11px]">Câmera remota do celular espelhada na tela do computador.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => wifiMidiBridge.requestRemoteStartCamera('environment', '1080P')}
                    className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition cursor-pointer border border-white/10"
                  >
                    Lente Traseira (Piano)
                  </button>
                  <button
                    type="button"
                    onClick={() => wifiMidiBridge.requestRemoteStopCamera()}
                    className="py-1.5 px-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-[11px] font-semibold transition cursor-pointer"
                  >
                    Parar Câmera Celular
                  </button>
                </div>
              </div>
            ) : wifiSyncStatus?.isConnected ? (
              <div className="space-y-2">
                <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Celular conectado ao PC ({wifiSyncStatus.hostDeviceName || 'Dispositivo Wi-Fi'})</span>
                </div>
                <button
                  type="button"
                  onClick={() => wifiMidiBridge.requestRemoteStartCamera('environment', '1080P')}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Iniciar Câmera do Celular para o PC</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-300">
                  Aponte a câmera do celular para o QR Code da sala para conectar em 3 segundos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenWifiSync) onOpenWifiSync();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Conectar Celular via QR Code / Wi-Fi</span>
                </button>
              </div>
            )}
          </div>

          {/* Inverter Horizontalmente (Efeito Espelho) */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-white/10">
            <div>
              <span className="text-xs font-bold text-white block">Inverter Vídeo Horizontalmente (Efeito Espelho)</span>
              <span className="text-[10.5px] text-zinc-400 block">
                Inverte a imagem da câmera local do PC como se fosse um espelho (não conecta ao celular)
              </span>
            </div>
            <button
              type="button"
              id="btn-toggle-mirror-video"
              onClick={() =>
                onUpdateCamera({
                  mirrorVideo:
                    cameraSettings.mirrorVideo !== undefined
                      ? !cameraSettings.mirrorVideo
                      : cameraSettings.facingMode !== 'user',
                })
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                (cameraSettings.mirrorVideo ?? (cameraSettings.facingMode === 'user'))
                  ? 'bg-amber-400 text-black shadow-sm'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white border border-white/10'
              }`}
            >
              {(cameraSettings.mirrorVideo ?? (cameraSettings.facingMode === 'user')) ? 'Invertido (Ativo)' : 'Normal'}
            </button>
          </div>

          {/* Seleção de Microfone */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="select-microphone-device" className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-zinc-400" />
                <span>Microfone Ativo</span>
              </div>
              <span className="text-[10px] text-zinc-400">
                {microphones && microphones.length > 0 ? `${microphones.length} disponível(is)` : 'Padrão do sistema'}
              </span>
            </label>
            <select
              id="select-microphone-device"
              value={cameraSettings.selectedAudioDeviceId || ''}
              onChange={(e) => onUpdateCamera({ selectedAudioDeviceId: e.target.value || undefined })}
              className="w-full bg-zinc-900 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="">Microfone Padrão do Sistema</option>
              {microphones && microphones.map((mic, idx) => (
                <option key={mic.deviceId || idx} value={mic.deviceId}>
                  {mic.label || `Microfone ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Opção de Áudio na Gravação: Apenas Som do Teclado vs Teclado + Mic vs Apenas Mic */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <div>
              <span className="text-xs font-bold text-white block">Áudio da Gravação do Vídeo</span>
              <span className="text-[11px] text-zinc-400 block">
                Escolha o que deseja capturar no áudio do arquivo gravado
              </span>
            </div>

            {/* WASAPI Master Audio & Anti-Clip Engine Indicator */}
            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="font-bold text-cyan-200 block text-[11px]">
                    Master WASAPI Studio Ativo
                  </span>
                  <span className="text-[10px] text-zinc-400 block">
                    Limiter True-Peak + Soft-Clipper: zero clipes ao tocar e na gravação de Piano + Voz
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-mono text-[9px] font-bold uppercase tracking-wider shrink-0 border border-cyan-500/30">
                WASAPI HD
              </span>
            </div>

            {/* Timbre SF2 Ativo Banner */}
            <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-zinc-900 to-cyan-500/10 border border-amber-400/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Music className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] text-zinc-400 block uppercase font-bold tracking-wider">Timbre SF2 Atual na Gravação:</span>
                  <span className="text-xs font-bold text-amber-300 truncate block">
                    {activeSoundFontName || 'Nenhum SoundFont (.sf2) Carregado'}
                  </span>
                </div>
              </div>
              {onOpenSoundFontModal && (
                <button
                  type="button"
                  onClick={onOpenSoundFontModal}
                  className="px-2.5 py-1 rounded-lg bg-amber-400 text-black font-bold text-[10.5px] hover:bg-amber-300 transition shrink-0 shadow cursor-pointer active:scale-95"
                >
                  Trocar SF2
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Opção 1: Apenas Teclado (SF2 100% Digital Puro) */}
              <button
                type="button"
                id="btn-audio-source-keyboard-only"
                onClick={() => onUpdateCamera({ audioRecordSource: 'keyboard-only', micEnabled: false })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  cameraSettings.audioRecordSource === 'keyboard-only' || (!cameraSettings.micEnabled && cameraSettings.audioRecordSource !== 'mic-only')
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">🎹 Apenas Teclado (SF2)</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      cameraSettings.audioRecordSource === 'keyboard-only' || (!cameraSettings.micEnabled && cameraSettings.audioRecordSource !== 'mic-only')
                        ? 'bg-black text-amber-400'
                        : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      100% Puro
                    </span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    cameraSettings.audioRecordSource === 'keyboard-only' || (!cameraSettings.micEnabled && cameraSettings.audioRecordSource !== 'mic-only')
                      ? 'text-black/80 font-medium'
                      : 'text-zinc-400'
                  }`}>
                    Grava exclusivamente o áudio do SoundFont SF2 digital. Microfone mutado, zero eco ou barulho da sala.
                  </div>
                </div>
              </button>

              {/* Opção 2: Teclado + Microfone */}
              <button
                type="button"
                id="btn-audio-source-keyboard-and-mic"
                onClick={() => onUpdateCamera({ audioRecordSource: 'keyboard-and-mic', micEnabled: true })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  (cameraSettings.audioRecordSource === 'keyboard-and-mic' || !cameraSettings.audioRecordSource) && cameraSettings.micEnabled
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">🎙️ Teclado + Microfone</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      (cameraSettings.audioRecordSource === 'keyboard-and-mic' || !cameraSettings.audioRecordSource) && cameraSettings.micEnabled
                        ? 'bg-black text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      Voz & Piano
                    </span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    (cameraSettings.audioRecordSource === 'keyboard-and-mic' || !cameraSettings.audioRecordSource) && cameraSettings.micEnabled
                      ? 'text-black/80 font-medium'
                      : 'text-zinc-400'
                  }`}>
                    Grava sua voz pelo microfone misturada ao som digital do teclado com mixagem equilibrada de estúdio.
                  </div>
                </div>
              </button>

              {/* Opção 3: Apenas Microfone */}
              <button
                type="button"
                id="btn-audio-source-mic-only"
                onClick={() => onUpdateCamera({ audioRecordSource: 'mic-only', micEnabled: true })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  cameraSettings.audioRecordSource === 'mic-only'
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">🗣️ Apenas Microfone</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      cameraSettings.audioRecordSource === 'mic-only'
                        ? 'bg-black text-amber-400'
                        : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      Ambiente
                    </span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    cameraSettings.audioRecordSource === 'mic-only' ? 'text-black/80 font-medium' : 'text-zinc-400'
                  }`}>
                    Grava apenas o microfone (voz e acústica ambiente). Teclado interno não vai para o vídeo.
                  </div>
                </div>
              </button>
            </div>

            {/* Controles de Volume e Balanço na Gravação */}
            <div className="mt-2 p-3 rounded-xl bg-zinc-900/90 border border-white/10 flex flex-col gap-3">
              {/* Slider: Volume do Teclado (Timbre SF2) na Gravação */}
              {cameraSettings.audioRecordSource !== 'mic-only' && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Volume do Teclado (Timbre SF2) no Vídeo</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-cyan-400 font-bold">
                        {Math.round((cameraSettings.keyboardRecordingGainLevel ?? 0.85) * 100)}%
                      </span>
                      {(cameraSettings.keyboardRecordingGainLevel ?? 0.85) !== 0.85 && (
                        <button
                          type="button"
                          onClick={() => onUpdateCamera({ keyboardRecordingGainLevel: 0.85 })}
                          className="text-[10px] text-zinc-400 hover:text-cyan-400 underline cursor-pointer"
                        >
                          Resetar
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.8"
                    step="0.05"
                    value={cameraSettings.keyboardRecordingGainLevel ?? 0.85}
                    onChange={(e) => onUpdateCamera({ keyboardRecordingGainLevel: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>20% (Fundo Suave)</span>
                    <span className="text-cyan-400 font-semibold">85% (Padrão Calibrado)</span>
                    <span>120%</span>
                    <span>180% (Forte)</span>
                  </div>
                </div>
              )}

              {/* Slider: Volume do Microfone (Voz) na Gravação */}
              {cameraSettings.micEnabled && cameraSettings.audioRecordSource !== 'keyboard-only' && (
                <div className="flex flex-col gap-1 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-amber-400" />
                      <span>Volume do Microfone (Voz)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-400 font-bold">
                        {Math.round((cameraSettings.micGainLevel ?? 1.0) * 100)}%
                      </span>
                      {(cameraSettings.micGainLevel ?? 1.0) !== 1.0 && (
                        <button
                          type="button"
                          onClick={() => onUpdateCamera({ micGainLevel: 1.0 })}
                          className="text-[10px] text-zinc-400 hover:text-amber-400 underline cursor-pointer"
                        >
                          Resetar
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="3.0"
                    step="0.05"
                    value={cameraSettings.micGainLevel ?? 1.0}
                    onChange={(e) => onUpdateCamera({ micGainLevel: parseFloat(e.target.value) })}
                    className="w-full accent-amber-400 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>50% (Baixo)</span>
                    <span className="text-amber-400 font-semibold">100% (+Preamp Estúdio)</span>
                    <span>200%</span>
                    <span>300% (Boost Máx)</span>
                  </div>
                </div>
              )}

              <div className="text-[10px] text-zinc-400 bg-black/40 p-2 rounded-lg border border-white/5 leading-relaxed">
                🛡️ <strong>Zero Clipping / Limiter Ativo</strong>: Compressor e limiter de estúdio em tempo real garantem que o som do timbre SF2 e a voz nunca distorçam ou saturem o arquivo final de vídeo.
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Camera Resolution & FPS */}
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-amber-400" />
            <h4 className="text-sm font-bold">Resolução & Taxa de Quadros</h4>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['4K', '1080P', '720P'] as const).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => onUpdateCamera({ resolution: res })}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  cameraSettings.resolution === res
                    ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {res}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([24, 30, 60] as const).map((fps) => (
              <button
                key={fps}
                type="button"
                onClick={() => onUpdateCamera({ fps })}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  cameraSettings.fps === fps
                    ? 'bg-amber-400 text-black border-amber-300 shadow-md'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {fps} FPS {fps === 24 && '(Cinema)'}
              </button>
            ))}
          </div>

          {/* Proporção de Gravação (9:16 Vertical vs 16:9 Horizontal) */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Proporção de Gravação (PC & Celular)</span>
                <span className="text-[11px] text-zinc-400 block">
                  Escolha se deseja gravar em formato vertical (Reels/TikTok) ou horizontal (Widescreen)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-aspect-916"
                onClick={() => onUpdateCamera({ aspectRatio: '9:16' })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  (cameraSettings.aspectRatio || '9:16') === '9:16'
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">9:16 Vertical</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      (cameraSettings.aspectRatio || '9:16') === '9:16'
                        ? 'bg-black text-amber-400'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      Reels / TikTok
                    </span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    (cameraSettings.aspectRatio || '9:16') === '9:16' ? 'text-black/80 font-medium' : 'text-zinc-400'
                  }`}>
                    Corta e formata automaticamente em 9:16 tanto no PC quanto no celular. Ideal para Shorts e Reels!
                  </div>
                </div>
              </button>

              <button
                type="button"
                id="btn-aspect-169"
                onClick={() => onUpdateCamera({ aspectRatio: '16:9' })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  cameraSettings.aspectRatio === '16:9'
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">16:9 Horizontal</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      cameraSettings.aspectRatio === '16:9'
                        ? 'bg-black text-amber-400'
                        : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      YouTube
                    </span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    cameraSettings.aspectRatio === '16:9' ? 'text-black/80 font-medium' : 'text-zinc-400'
                  }`}>
                    Grava em tela cheia widescreen landscape. Ideal para monitores, TV e YouTube tradicional.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Android Recording Performance Mode */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Modo de Gravação</span>
                <span className="text-[11px] text-zinc-400 block">
                  Escolha se deseja gravar com o teclado desenhado ou gravação direta sem travamento
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-rec-mode-direct"
                onClick={() => onUpdateCamera({ recordingMode: 'direct' })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  (cameraSettings.recordingMode || 'direct') === 'direct'
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">Direto (Hardware)</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      (cameraSettings.recordingMode || 'direct') === 'direct'
                        ? 'bg-black text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      0% Lag
                    </span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    (cameraSettings.recordingMode || 'direct') === 'direct' ? 'text-black/80 font-medium' : 'text-zinc-400'
                  }`}>
                    Grava o sensor da câmera fluido a 60 FPS + áudio perfeito do piano/MIDI. Recomendado!
                  </div>
                </div>
              </button>

              <button
                type="button"
                id="btn-rec-mode-overlay"
                onClick={() => onUpdateCamera({ recordingMode: 'overlay' })}
                className={`p-2.5 rounded-xl text-xs border text-left transition cursor-pointer flex flex-col justify-between ${
                  cameraSettings.recordingMode === 'overlay'
                    ? 'bg-amber-400 text-black border-amber-300 font-bold shadow-md ring-2 ring-amber-400/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-xs">Com Teclado (Overlay)</span>
                  </div>
                  <div className={`text-[10px] leading-tight ${
                    cameraSettings.recordingMode === 'overlay' ? 'text-black/80 font-medium' : 'text-zinc-400'
                  }`}>
                    Grava o desenho das teclas acesas no arquivo de vídeo (pode causar queda de frames no Android).
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Section 5: PWA Install App & iOS Permissions */}
        <div className="flex flex-col gap-2">
          <PWAInstallButton variant="settings-item" />

          {/* iPhone Permissions Helper */}
          <button
            type="button"
            onClick={() => setIsIOSGuideOpen(true)}
            className="w-full p-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-white/10 flex items-center justify-between text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">Permissões no iPhone (Câmera & Galeria)</span>
                <span className="text-[10px] text-zinc-400">Ver como autorizar nos Ajustes do iOS</span>
              </div>
            </div>
            <HelpCircle className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Footer info & Close */}
        <div className="text-[11px] text-zinc-400 text-center">
          Dica: Os vídeos gravados combinam a imagem com os filtros, as cifras e o teclado virtual renderizado na tela.
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-sm transition"
        >
          Fechar
        </button>

        {/* iOS Permissions Guide Modal */}
        <IOSPermissionGuideModal
          isOpen={isIOSGuideOpen}
          onClose={() => setIsIOSGuideOpen(false)}
          onRetryCamera={() => {
            setIsIOSGuideOpen(false);
            onClose();
          }}
        />
      </div>
    </div>
  );
};
