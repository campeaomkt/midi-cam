import React, { useId, useState, useEffect } from 'react';
import { CameraSettings, KeyboardSettings, KeyCount, MidiDevice, WifiSyncStatus } from '../types';
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
  Languages,
  Sliders,
  Mic,
  MicOff,
  ShieldCheck,
} from 'lucide-react';
import { KEY_COUNT_OPTIONS } from './VirtualKeyboard';
import { PWAInstallButton } from './PWAInstallButton';
import { IOSPermissionGuideModal } from './IOSPermissionGuideModal';
import {
  KEYBOARD_COLOR_PALETTE,
  getEffectiveActiveColor,
} from '../utils/keyboardColor';
import { audioSynth } from '../utils/audioSynth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraSettings: CameraSettings;
  keyboardSettings: KeyboardSettings;
  midiDevices: MidiDevice[];
  isMidiConnected: boolean;
  activeSoundFontName?: string;
  wifiSyncStatus?: WifiSyncStatus;
  onOpenWifiSync?: () => void;
  onOpenSoundFontModal?: () => void;
  onOpenAiDubbing?: () => void;
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
  onOpenWifiSync,
  onOpenSoundFontModal,
  onOpenAiDubbing,
  onRequestMidi,
  onUpdateCamera,
  onUpdateKeyboard,
}) => {
  const colorInputId = useId();
  const [isIOSGuideOpen, setIsIOSGuideOpen] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testMicLevel, setTestMicLevel] = useState(0);

  // Live microphone test animation and VU level reader
  useEffect(() => {
    let animId: number;
    let active = true;

    if (isTestingMic && isOpen) {
      audioSynth
        .enableMicrophone(cameraSettings.micVolume ?? 1.0)
        .then((success) => {
          if (!success && active) {
            setIsTestingMic(false);
          }
        });

      const tick = () => {
        if (!active) return;
        setTestMicLevel(audioSynth.getMicLevel());
        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
    } else {
      setTestMicLevel(0);
    }

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [isTestingMic, isOpen, cameraSettings.micVolume]);

  // Clean up test when modal closes
  useEffect(() => {
    if (!isOpen && isTestingMic) {
      audioSynth.disableMicrophone();
      setIsTestingMic(false);
    }
  }, [isOpen, isTestingMic]);

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

        {/* Section 1.8: AI Dubbing & Spanish Translation (OpenAI) */}
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-zinc-900 border border-emerald-500/40 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400 text-black shadow-md">
                <Languages className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>Dublagem IA para Espanhol</span>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 font-mono font-bold border border-emerald-400/30">
                    OpenAI
                  </span>
                </h4>
                <p className="text-xs text-zinc-400">
                  Configure sua OpenAI API Key para transcrever, traduzir e dublar criativos
                </p>
              </div>
            </div>
          </div>

          {/* Direct API Key Input Inside Settings */}
          <div className="flex flex-col gap-1.5 bg-black/60 p-3 rounded-xl border border-white/10">
            <label className="text-xs text-zinc-300 font-semibold flex items-center justify-between">
              <span>Chave de API da OpenAI (sk-...)</span>
              <span className="text-[10px] text-emerald-400 font-medium">Salva no seu navegador</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
                defaultValue={(() => {
                  try {
                    const raw = localStorage.getItem('midicam_openai_config');
                    if (raw) return JSON.parse(raw).apiKey || '';
                  } catch {}
                  return '';
                })()}
                id="openai-api-key-settings-input"
                className="flex-1 bg-zinc-900 border border-white/20 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 transition"
              />
              <button
                type="button"
                id="btn-save-openai-key-settings"
                onClick={(e) => {
                  const input = document.getElementById('openai-api-key-settings-input') as HTMLInputElement;
                  if (input) {
                    const val = input.value.trim();
                    try {
                      const raw = localStorage.getItem('midicam_openai_config');
                      const parsed = raw ? JSON.parse(raw) : {};
                      localStorage.setItem(
                        'midicam_openai_config',
                        JSON.stringify({
                          apiKey: val,
                          voice: parsed.voice || 'onyx',
                          model: parsed.model || 'tts-1-hd',
                        })
                      );
                      alert('Chave OpenAI salva com sucesso!');
                    } catch (err) {
                      console.error(err);
                    }
                  }
                }}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-extrabold text-xs transition cursor-pointer active:scale-95 shrink-0 shadow"
              >
                Salvar Chave
              </button>
            </div>
          </div>

          {onOpenAiDubbing && (
            <button
              type="button"
              id="btn-open-dubbing-studio-from-settings"
              onClick={() => {
                onClose();
                onOpenAiDubbing();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center justify-between transition cursor-pointer"
            >
              <span>Abrir Estúdio de Dublagem IA & Ajuste de Copy</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

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
                <h4 className="text-sm font-bold">Som do Teclado (Sintetizador)</h4>
                <p className="text-xs text-zinc-400">Gera som de piano e grava no vídeo</p>
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
                step="0.05"
                value={keyboardSettings.synthVolume}
                onChange={(e) => onUpdateKeyboard({ synthVolume: parseFloat(e.target.value) })}
                className="w-full accent-amber-400 h-1.5 bg-zinc-900 rounded-lg cursor-pointer"
              />

              {/* SoundFont 2 (.sf2) Manager Trigger */}
              {onOpenSoundFontModal && (
                <div className="mt-2 pt-2.5 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <div>
                      <span className="text-xs font-bold block text-white">Timbres & SoundFont (.sf2)</span>
                      <span className="text-[11px] text-zinc-400 block">
                        {activeSoundFontName ? `Ativo: ${activeSoundFontName}` : 'Usando sintetizador padrão'}
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
            </div>
          )}
        </div>

        {/* Section 2c: Phone Microphone + Timbre Dual Audio Recording */}
        <div
          id="setting-audio-mic-timbre-section"
          className="flex flex-col gap-3 p-3.5 rounded-xl bg-gradient-to-br from-zinc-800/90 to-zinc-900/95 border border-emerald-500/30 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl border transition ${
                  cameraSettings.micEnabled
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'bg-zinc-800 text-zinc-400 border-white/10'
                }`}
              >
                {cameraSettings.micEnabled ? (
                  <Mic className="w-5 h-5 animate-pulse" />
                ) : (
                  <MicOff className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">
                    Gravar Mic do Celular + Som do Timbre
                  </h4>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      cameraSettings.micEnabled
                        ? 'bg-emerald-400 text-black shadow'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {cameraSettings.micEnabled ? 'Ativo' : 'Desativado'}
                  </span>
                </div>
                <p className="text-xs text-zinc-300">
                  Grava sua voz / fala pelo microfone do celular mixado junto com o som do timbre no vídeo
                </p>
              </div>
            </div>

            <button
              type="button"
              id="btn-toggle-mic-recording-setting"
              onClick={() => onUpdateCamera({ micEnabled: !cameraSettings.micEnabled })}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer active:scale-95 ${
                cameraSettings.micEnabled
                  ? 'bg-emerald-400 text-black border-emerald-300 shadow-md ring-2 ring-emerald-400/30'
                  : 'bg-zinc-800 text-zinc-300 border-white/10 hover:text-white'
              }`}
            >
              {cameraSettings.micEnabled ? 'Ligado' : 'Desligado'}
            </button>
          </div>

          {cameraSettings.micEnabled ? (
            <div className="flex flex-col gap-3 pt-2 border-t border-white/10">
              {/* Mic Gain Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-semibold">
                    Volume do Microfone (Ganho da Voz na Gravação)
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {Math.round((cameraSettings.micVolume ?? 1.0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={cameraSettings.micVolume ?? 1.0}
                  onChange={(e) => onUpdateCamera({ micVolume: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-400 h-2 bg-zinc-900 rounded-lg cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[
                    { label: '50% (Baixo)', val: 0.5 },
                    { label: '80% (Suave)', val: 0.8 },
                    { label: '100% (Padrão)', val: 1.0 },
                    { label: '130% (Forte)', val: 1.3 },
                  ].map((preset) => {
                    const isCur = Math.abs((cameraSettings.micVolume ?? 1.0) - preset.val) < 0.04;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => onUpdateCamera({ micVolume: preset.val })}
                        className={`py-1 rounded text-[10px] font-semibold transition cursor-pointer ${
                          isCur
                            ? 'bg-emerald-400 text-black font-bold shadow'
                            : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-Time Microphone Test & VU Meter */}
              <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/20 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">
                      Teste do Microfone em Tempo Real
                    </span>
                    {isTestingMic && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Ouvindo...
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isTestingMic) {
                        audioSynth.disableMicrophone();
                        setIsTestingMic(false);
                      } else {
                        setIsTestingMic(true);
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                      isTestingMic
                        ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    }`}
                  >
                    {isTestingMic ? 'Parar Teste' : 'Testar Captação'}
                  </button>
                </div>

                {/* Animated VU Meter Bar */}
                <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-white/10 flex items-center">
                  <div
                    className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500"
                    style={{
                      width: `${Math.min(100, Math.max(isTestingMic ? 4 : 0, testMicLevel * 100))}%`,
                    }}
                  />
                </div>
                {isTestingMic ? (
                  <p className="text-[10px] text-zinc-400">
                    Fale próximo ao celular: a barra colorida deve vibrar com a sua voz!
                  </p>
                ) : (
                  <p className="text-[10px] text-zinc-500">
                    Toque em &quot;Testar Captação&quot; para testar a captação do microfone do seu telefone agora.
                  </p>
                )}
              </div>

              {/* Anti-Feedback Guarantee Note */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-zinc-300">
                  <strong className="text-emerald-300 block">Isolamento Anti-Microfonia Ativo:</strong>
                  Sua voz é gravada <span className="text-white font-medium">somente no arquivo de vídeo</span>. O microfone não sai nos alto-falantes do telefone para evitar microfonia (apito acústico).
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 bg-zinc-900/50 p-2.5 rounded-lg border border-white/5">
              💡 Quando desativado, o vídeo gravará <strong className="text-zinc-200">apenas o som digital do timbre/sintetizador</strong>, sem ruídos externos de ambiente ou conversas.
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
                desc: 'Face frontal chanfrada em cada tecla, feltro vermelho e marfim acetinado',
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
                  <div className="w-full h-4 rounded overflow-hidden flex items-stretch border border-white/15 mt-1 bg-neutral-900">
                    <div className="flex-1 h-full bg-white flex flex-col justify-between border-r border-neutral-300">
                      <div className="h-[2px] bg-red-700/80 w-full" />
                      {model.id === 'realistic-3d' && (
                        <div className="h-1 bg-neutral-400/90 w-full border-b border-neutral-700" />
                      )}
                    </div>
                    <div className="w-2.5 h-[65%] bg-black -mx-1 z-10 rounded-b-[1px] border-x border-neutral-700" />
                    <div className="flex-1 h-full bg-white flex flex-col justify-between border-r border-neutral-300">
                      <div className="h-[2px] bg-red-700/80 w-full" />
                      {model.id === 'realistic-3d' && (
                        <div className="h-1 bg-neutral-400/90 w-full border-b border-neutral-700" />
                      )}
                    </div>
                    <div className="w-2.5 h-[65%] bg-black -mx-1 z-10 rounded-b-[1px] border-x border-neutral-700" />
                    <div className="flex-1 h-full bg-white flex flex-col justify-between">
                      <div className="h-[2px] bg-red-700/80 w-full" />
                      {model.id === 'realistic-3d' && (
                        <div className="h-1 bg-neutral-400/90 w-full border-b border-neutral-700" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
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
