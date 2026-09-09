import React, { useState, useEffect, useId } from 'react';
import {
  Wifi,
  Radio,
  Smartphone,
  Laptop,
  Check,
  Copy,
  AlertCircle,
  QrCode,
  ArrowRight,
  RefreshCw,
  Terminal,
  Activity,
  Music,
  Zap,
  X,
  Sliders,
} from 'lucide-react';
import QRCode from 'qrcode';
import { wifiMidiBridge } from '../utils/wifiMidiBridge';
import { midiManager } from '../utils/midiManager';
import { WifiSyncStatus } from '../types';

interface WifiMidiSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestMidi?: () => void;
}

export const WifiMidiSyncModal: React.FC<WifiMidiSyncModalProps> = ({
  isOpen,
  onClose,
  onRequestMidi,
}) => {
  const [activeTab, setActiveTab] = useState<'host' | 'client' | 'tauriGuide'>('client');
  const [syncStatus, setSyncStatus] = useState<WifiSyncStatus>(wifiMidiBridge.getStatus());
  const [inputCode, setInputCode] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [lastNoteActivity, setLastNoteActivity] = useState<string | null>(null);
  const inputCodeId = useId();

  // Subscribe to Wi-Fi sync status changes
  useEffect(() => {
    const unsubscribe = wifiMidiBridge.subscribe((status) => {
      setSyncStatus(status);
      if (status.mode === 'host') {
        setActiveTab('host');
      } else if (status.mode === 'client' && status.isConnected) {
        setActiveTab('client');
      }
    });
    return unsubscribe;
  }, []);

  // Listen to MIDI notes for visual confirmation in host mode
  useEffect(() => {
    const unbindNote = midiManager.onNoteOn((note, vel) => {
      setLastNoteActivity(`Nota ${note} (Vel ${vel})`);
      setTimeout(() => setLastNoteActivity(null), 800);
    });
    return unbindNote;
  }, []);

  // Generate QR Code when in host mode with roomCode
  useEffect(() => {
    if (syncStatus.mode === 'host' && syncStatus.roomCode) {
      const baseUrl = window.location.origin + window.location.pathname;
      const shareUrl = `${baseUrl}?sync=${syncStatus.roomCode}`;

      QRCode.toDataURL(shareUrl, {
        width: 240,
        margin: 1,
        color: {
          dark: '#050508',
          light: '#ffffff',
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error('Error creating QR Code', err));
    } else {
      setQrCodeDataUrl(null);
    }
  }, [syncStatus.mode, syncStatus.roomCode]);

  if (!isOpen) return null;

  const handleStartHost = async () => {
    await wifiMidiBridge.startHost();
    if (onRequestMidi) onRequestMidi();
  };

  const handleConnectClient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputCode.trim()) return;
    await wifiMidiBridge.connectClient(inputCode);
  };

  const handleDisconnect = () => {
    wifiMidiBridge.disconnect();
  };

  const copyConnectionLink = () => {
    if (!syncStatus.roomCode) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?sync=${syncStatus.roomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const copyCommand = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2000);
    });
  };

  const midiDevices = midiManager.getDevices();

  return (
    <div
      id="wifi-midi-sync-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Wifi className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                Sincronização Wi-Fi (PC ⇄ Celular)
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Sem Cabos
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Toque no PC ou DAW e grave o vídeo sincronizado no celular
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 p-2 bg-black/40 border-b border-white/5 gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('client')}
            className={`py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'client'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Receptor (Celular)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('host')}
            className={`py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'host'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Transmissor (PC)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tauriGuide')}
            className={`py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'tauriGuide'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>App Nativo (Tauri)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm flex-1">
          {/* TAB 1: RECEPTOR (CELULAR) */}
          {activeTab === 'client' && (
            <div className="space-y-4">
              {/* Connection Status Box */}
              {syncStatus.isConnected && syncStatus.mode === 'client' ? (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <div>
                        <h4 className="font-bold text-emerald-300 text-sm">
                          Conectado ao {syncStatus.hostDeviceName || 'PC'}!
                        </h4>
                        <p className="text-xs text-emerald-400/80">
                          Código pareado: <span className="font-mono font-bold">{syncStatus.roomCode}</span>
                        </p>
                      </div>
                    </div>

                    {syncStatus.latencyMs !== null && (
                      <div className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-400" />
                        <span>{syncStatus.latencyMs}ms</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-zinc-300">
                    Toque no teclado conectado ao PC ou na sua DAW. As notas vão acender na tela do celular e entrar no vídeo em tempo real!
                  </p>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="w-full py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 font-semibold text-xs transition cursor-pointer"
                  >
                    Desconectar do PC
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConnectClient} className="space-y-4">
                  <div className="p-4 rounded-2xl bg-zinc-800/60 border border-white/10 space-y-3">
                    <div className="flex items-center gap-2 text-zinc-200 font-semibold">
                      <QrCode className="w-4 h-4 text-cyan-400" />
                      <span>Conectar ao MIDI do seu Computador</span>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Abra o <strong>MIDI-Cam</strong> no navegador do seu PC (ou app nativo), clique na aba <strong>Transmissor (PC)</strong> e digite aqui o código de 6 dígitos que aparecer na tela do computador:
                    </p>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={inputCodeId} className="text-xs text-zinc-400 font-medium">
                        Código do Computador:
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={inputCodeId}
                          type="text"
                          maxLength={8}
                          value={inputCode}
                          onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                          placeholder="EX: MC-8924"
                          className="flex-1 bg-black/60 border border-white/20 rounded-xl px-4 py-2.5 font-mono text-center font-bold tracking-widest text-lg text-cyan-300 uppercase placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="submit"
                          disabled={!inputCode.trim() || syncStatus.isConnecting}
                          className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-sm transition flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.35)] cursor-pointer"
                        >
                          {syncStatus.isConnecting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span>Conectar</span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {syncStatus.error && (
                      <div className="p-3 rounded-xl bg-red-900/30 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                        <span>{syncStatus.error}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                    <h5 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      Como funciona a sincronização rápida?
                    </h5>
                    <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-inside">
                      <li>Usa canal <strong>WebRTC DataChannel direto</strong> entre os dois aparelhos no mesmo Wi-Fi.</li>
                      <li>Latência típica de apenas <strong>2 a 5 milissegundos</strong>.</li>
                      <li>Você também pode simplesmente <strong>apontar a câmera do celular para o QR Code</strong> na tela do PC para conectar direto sem digitar nada!</li>
                    </ul>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: TRANSMISSOR (PC / MAC) */}
          {activeTab === 'host' && (
            <div className="space-y-4">
              {syncStatus.mode === 'host' && syncStatus.roomCode ? (
                <div className="space-y-4">
                  {/* Active Host Banner */}
                  <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex flex-col items-center text-center gap-3">
                    <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                      </span>
                      Transmissor MIDI Ativo no Computador
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs text-zinc-400">Código de Pareamento:</span>
                      <div className="px-5 py-2 rounded-xl bg-black/70 border border-cyan-500/50 font-mono text-2xl font-black text-cyan-300 tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                        {syncStatus.roomCode}
                      </div>
                    </div>

                    {/* QR Code */}
                    {qrCodeDataUrl && (
                      <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl shadow-lg border border-white/20">
                        <img
                          src={qrCodeDataUrl}
                          alt="QR Code para conectar celular"
                          className="w-44 h-44 rounded-lg"
                        />
                        <span className="text-[11px] text-zinc-800 font-semibold">
                          Aponte a câmera do celular para conectar
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 w-full">
                      <button
                        type="button"
                        onClick={copyConnectionLink}
                        className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-semibold text-zinc-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Link Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Copiar Link Direto</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-xs font-semibold text-red-300 transition cursor-pointer"
                      >
                        Parar
                      </button>
                    </div>
                  </div>

                  {/* Connected Receivers Status */}
                  <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        Celulares / Receptores Conectados:
                      </span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                          syncStatus.peerCount > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-zinc-700/50 text-zinc-400'
                        }`}
                      >
                        {syncStatus.peerCount > 0
                          ? `${syncStatus.peerCount} Celular Conectado`
                          : 'Aguardando celular...'}
                      </span>
                    </div>

                    {lastNoteActivity && (
                      <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1.5 rounded-lg animate-pulse">
                        <Activity className="w-3.5 h-3.5" />
                        <span>Sinal MIDI detectado: {lastNoteActivity}</span>
                      </div>
                    )}
                  </div>

                  {/* Local MIDI Ports on PC */}
                  <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-amber-400" />
                        Dispositivos MIDI no Computador:
                      </span>
                      {onRequestMidi && (
                        <button
                          type="button"
                          onClick={onRequestMidi}
                          className="text-[11px] text-cyan-400 hover:underline"
                        >
                          Detectar portas
                        </button>
                      )}
                    </div>

                    {midiDevices.length > 0 ? (
                      <ul className="space-y-1">
                        {midiDevices.map((dev) => (
                          <li
                            key={dev.id}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-white/5 flex items-center justify-between"
                          >
                            <span className="font-medium text-zinc-200">{dev.name}</span>
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                              <Check className="w-3 h-3" /> Ativo
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-zinc-500 italic p-2 rounded-lg bg-zinc-900/50">
                        Nenhum teclado USB plugado diretamente ainda. Conecte seu teclado ou porta virtual da DAW (ex: loopMIDI) para começar a tocar.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-zinc-800/60 border border-white/10 flex flex-col items-center text-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                    <Laptop className="w-8 h-8" />
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-white">Transmitir MIDI deste Computador</h4>
                    <p className="text-xs text-zinc-400 max-w-sm mt-1">
                      Inicie o servidor de transmissão para que qualquer celular conectado no mesmo Wi-Fi receba suas notas instantaneamente.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartHost}
                    disabled={syncStatus.isConnecting}
                    className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm transition flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer"
                  >
                    {syncStatus.isConnecting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Radio className="w-4 h-4" />
                        <span>Iniciar Transmissor Wi-Fi no PC</span>
                      </>
                    )}
                  </button>

                  <div className="text-[11px] text-zinc-500 leading-relaxed">
                    Compatível com Chrome, Edge, Brave no Windows, Mac e Linux, ou empacotado como aplicativo nativo via Tauri.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GUIA DO APP NATIVO NO PC (TAURI + VSCODE) */}
          {activeTab === 'tauriGuide' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                  <Terminal className="w-5 h-5" />
                </div>
                <div className="space-y-1 text-xs">
                  <h4 className="font-bold text-amber-300 text-sm">
                    Criar App Nativo (.exe / .dmg) com Tauri + VS Code
                  </h4>
                  <p className="text-zinc-300 leading-relaxed">
                    O <strong>Tauri</strong> cria um aplicativo ultraleve (menos de 10MB) em Rust + Webview nativo que consome pouca memória e inicia instantaneamente no PC com o nome <strong>midi-cam</strong>.
                  </p>
                </div>
              </div>

              {/* Step 1 */}
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200">1. Requisitos Prévios no Windows / Mac:</span>
                  <span className="text-[10px] text-zinc-500 font-mono">1x apenas</span>
                </div>
                <ul className="text-zinc-400 space-y-1 list-disc list-inside">
                  <li><strong>Node.js</strong> (v18+) instalado.</li>
                  <li><strong>Rust</strong> instalado (basta rodar <code className="text-cyan-300">rustup-init.exe</code> de <a href="https://rustup.rs" target="_blank" rel="noreferrer" className="underline text-cyan-400">rustup.rs</a>).</li>
                  <li>No Windows: <strong>C++ Build Tools</strong> (instalador do Visual Studio Community).</li>
                </ul>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-zinc-200">2. Adicionar o Tauri ao projeto no terminal do VS Code:</span>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/80 font-mono text-[11px] text-cyan-300 border border-white/5">
                  <code>npm install -D @tauri-apps/cli</code>
                  <button
                    type="button"
                    onClick={() => copyCommand('npm install -D @tauri-apps/cli', 'cmd1')}
                    className="p-1 hover:text-white transition"
                    title="Copiar comando"
                  >
                    {copiedCmd === 'cmd1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-zinc-200">3. Inicializar a configuração do Tauri (nome: midi-cam):</span>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/80 font-mono text-[11px] text-cyan-300 border border-white/5">
                  <code>npx tauri init</code>
                  <button
                    type="button"
                    onClick={() => copyCommand('npx tauri init', 'cmd2')}
                    className="p-1 hover:text-white transition"
                    title="Copiar comando"
                  >
                    {copiedCmd === 'cmd2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Responda: Nome da janela: <strong>midi-cam</strong> | Dev URL: <code className="text-zinc-300">http://localhost:3000</code> | Dist dir: <code className="text-zinc-300">../dist</code>
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-zinc-200">4. Testar no PC em tempo real:</span>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/80 font-mono text-[11px] text-emerald-300 border border-white/5">
                  <code>npx tauri dev</code>
                  <button
                    type="button"
                    onClick={() => copyCommand('npx tauri dev', 'cmd3')}
                    className="p-1 hover:text-white transition"
                    title="Copiar comando"
                  >
                    {copiedCmd === 'cmd3' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Uma janela de aplicativo nativo do Windows/Mac será aberta com o <strong>midi-cam</strong> rodando e reconhecendo todos os seus teclados USB e DAWs!
                </p>
              </div>

              {/* Step 5 */}
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 space-y-2 text-xs">
                <span className="font-bold text-zinc-200">5. Gerar o Instalador Executável (.exe ou .msi no Windows):</span>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/80 font-mono text-[11px] text-amber-300 border border-white/5">
                  <code>npx tauri build</code>
                  <button
                    type="button"
                    onClick={() => copyCommand('npx tauri build', 'cmd4')}
                    className="p-1 hover:text-white transition"
                    title="Copiar comando"
                  >
                    {copiedCmd === 'cmd4' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  O instalador final pronto para distribuir será gerado na pasta: <code className="text-zinc-300">src-tauri/target/release/bundle/msi/</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-zinc-900/80 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>WebRTC Direct LAN (Sem Servidor Intermediário)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
