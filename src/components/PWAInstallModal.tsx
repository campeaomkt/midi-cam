import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Share2,
  PlusSquare,
  Smartphone,
  CheckCircle2,
  Sparkles,
  Info,
  Layers,
  WifiOff,
  Video,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>(isIOS ? 'ios' : 'android');
  const [isInstalling, setIsInstalling] = useState(false);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const handleDirectInstall = async () => {
    setIsInstalling(true);
    try {
      const success = await install();
      if (success) {
        onClose();
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const modalContent = (
    <div
      id="pwa-install-modal-backdrop"
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="pwa-install-modal-container"
        className="relative w-full sm:max-w-lg bg-zinc-900 border border-white/15 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] text-white overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-4 py-3.5 sm:px-5 sm:py-4 border-b border-white/10 bg-zinc-900/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 p-0.5 shadow-[0_0_15px_rgba(59,245,176,0.35)] flex items-center justify-center shrink-0">
              <img
                src="/icon.svg"
                alt="App Icon"
                className="w-full h-full rounded-[10px] object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight text-white">
                Instalar Aplicativo
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-400">
                Fixe na tela inicial no Android ou iPhone / iPad
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-pwa-modal"
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer active:scale-90"
            title="Fechar"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col gap-3.5 text-zinc-300 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          {/* Already Installed Alert */}
          {isInstalled && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <div className="text-xs leading-relaxed">
                <strong className="block font-bold text-emerald-200">Aplicativo Já Instalado!</strong>
                Você já está rodando em modo nativo / tela cheia.
              </div>
            </div>
          )}

          {/* Quick One-Click Install Button (Chromium / Android prompt available) */}
          {isInstallable && !isInstalled && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-emerald-950/70 to-cyan-950/70 border border-emerald-400/50 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold text-xs sm:text-sm text-emerald-200">
                  Instalação Direta com 1 Toque
                </span>
              </div>
              <p className="text-[11.5px] text-zinc-300 leading-normal">
                Seu aparelho suporta adicionar o ícone diretamente à tela inicial agora.
              </p>
              <button
                type="button"
                id="btn-pwa-direct-install"
                disabled={isInstalling}
                onClick={handleDirectInstall}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-black font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(59,245,176,0.35)] transition active:scale-[0.98] cursor-pointer"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>{isInstalling ? 'Instalando...' : 'Instalar Agora na Tela Inicial'}</span>
              </button>
            </div>
          )}

          {/* Device Switcher Tabs */}
          <div className="flex rounded-xl bg-zinc-800/90 p-1 border border-white/10">
            <button
              type="button"
              id="tab-install-android"
              onClick={() => setActiveTab('android')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'android'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Android (Chrome)</span>
            </button>
            <button
              type="button"
              id="tab-install-ios"
              onClick={() => setActiveTab('ios')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'ios'
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>iPhone / iPad (iOS)</span>
            </button>
          </div>

          {/* Tab Content: Android */}
          {activeTab === 'android' && (
            <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 text-xs">
              <h4 className="font-bold text-xs sm:text-sm text-emerald-300 flex items-center gap-1.5">
                <span>Passo a passo para Android:</span>
              </h4>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                    1
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold">Abra no Chrome ou Samsung Internet</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Use o navegador padrão do seu aparelho para ter suporte nativo PWA.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                    2
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold">Toque nos 3 pontos (⋮)</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Fica no canto superior direito da janela do navegador.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                    3
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold">Toque em "Instalar aplicativo"</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Ou <span className="text-emerald-300 font-medium">"Adicionar à tela inicial"</span>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                    4
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold">Confirme tocando em Instalar</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      O ícone com a câmera e teclado será adicionado à sua tela de início.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: iOS */}
          {activeTab === 'ios' && (
            <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 text-xs">
              <h4 className="font-bold text-xs sm:text-sm text-amber-300 flex items-center gap-1.5">
                <span>Passo a passo no iPhone / iPad (Safari):</span>
              </h4>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-amber-400/30">
                    1
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold">Abra esta página no Safari</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      A Apple permite instalar aplicativos PWA exclusivamente através do navegador Safari.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-amber-400/30">
                    2
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold flex items-center gap-1.5 flex-wrap">
                      <span>Toque no botão Compartilhar</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white/10 text-amber-300 text-[11px]">
                        <Share2 className="w-3 h-3" /> Compartilhar
                      </span>
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      É o ícone quadrado com a seta para cima na barra inferior do iPhone ou no topo do iPad.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-amber-400/30">
                    3
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold flex items-center gap-1.5 flex-wrap">
                      <span>Role e toque em "Adicionar à Tela de Início"</span>
                      <PlusSquare className="w-3.5 h-3.5 text-amber-400 inline" />
                    </span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Fica na lista de ações do menu de compartilhamento.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5 border border-amber-400/30">
                    4
                  </div>
                  <div className="flex-1 text-[12px] leading-snug">
                    <span className="text-white font-semibold">Toque em "Adicionar" (canto superior direito)</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Pronto! O aplicativo abrirá sem as barras do Safari com máxima fluidez de áudio e vídeo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clean Horizontal Benefits Pills (No multi-line wrapping defects) */}
          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            <div className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-800/50 border border-white/5 flex items-center justify-center gap-1.5 text-center">
              <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-semibold text-zinc-300 whitespace-nowrap">Tela Cheia</span>
            </div>
            <div className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-800/50 border border-white/5 flex items-center justify-center gap-1.5 text-center">
              <WifiOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] font-semibold text-zinc-300 whitespace-nowrap">Modo Offline</span>
            </div>
            <div className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-800/50 border border-white/5 flex items-center justify-center gap-1.5 text-center">
              <Video className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-semibold text-zinc-300 whitespace-nowrap">Vídeo Fluido</span>
            </div>
          </div>
        </div>

        {/* Fixed Footer with prominent close button */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-t border-white/10 bg-zinc-900/95 shrink-0 flex items-center gap-3">
          <button
            type="button"
            id="btn-close-pwa-modal-footer"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs sm:text-sm transition cursor-pointer active:scale-95 text-center"
          >
            Entendi / Fechar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
