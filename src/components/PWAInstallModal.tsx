import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  PlusSquare,
  Smartphone,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Info,
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

  return (
    <div
      id="pwa-install-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-zinc-900/95 border border-white/15 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 p-0.5 shadow-[0_0_15px_rgba(59,245,176,0.35)] flex items-center justify-center">
              <img
                src="/icon.svg"
                alt="App Icon"
                className="w-full h-full rounded-[10px] object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Instalar Aplicativo</h3>
              <p className="text-xs text-zinc-400">Instale no seu Android ou iPhone (iOS)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Already Installed Alert */}
        {isInstalled ? (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-300">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
            <div className="text-xs">
              <strong className="block font-bold text-sm text-emerald-200">
                Aplicativo Já Instalado!
              </strong>
              Você já está executando o app no modo tela cheia / nativo standalone.
            </div>
          </div>
        ) : null}

        {/* Quick One-Click Install Button (Chromium / Android prompt available) */}
        {isInstallable && !isInstalled && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-400/40 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-sm text-emerald-200">
                Instalação Direta Disponível!
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Seu navegador suporta instalação imediata com 1 clique direto na tela inicial.
            </p>
            <button
              type="button"
              disabled={isInstalling}
              onClick={handleDirectInstall}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(59,245,176,0.4)] transition active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>{isInstalling ? 'Instalando...' : 'Instalar Agora na Tela Inicial'}</span>
            </button>
          </div>
        )}

        {/* Device Switcher Tabs */}
        <div className="flex rounded-xl bg-zinc-800/80 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'android'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android (Chrome / Samsung)</span>
          </button>
          <button
            type="button"
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
          <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/50 border border-white/10 text-xs">
            <h4 className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
              <span>Como instalar no Android:</span>
            </h4>

            <ol className="flex flex-col gap-3 text-zinc-300 list-decimal list-inside">
              <li className="leading-relaxed">
                <strong className="text-white font-semibold">
                  Abra no Google Chrome ou Samsung Internet
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  Certifique-se de estar usando o navegador Chrome padrão no seu aparelho.
                </p>
              </li>

              <li className="leading-relaxed">
                <strong className="text-white font-semibold">
                  Clique no menu de três pontos (⋮)
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  Localizado no canto superior direito do seu navegador.
                </p>
              </li>

              <li className="leading-relaxed">
                <strong className="text-white font-semibold">
                  Selecione "Instalar aplicativo" ou "Adicionar à tela inicial"
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  Confirme a mensagem tocando em <strong className="text-emerald-300">Instalar</strong>. O ícone será colocado na sua gaveta de aplicativos e na tela inicial.
                </p>
              </li>
            </ol>

            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-white/10 text-[11px] text-zinc-400">
              <Info className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Após instalado, o app funciona em tela cheia sem barras do navegador, com suporte offline e acesso veloz a câmera e MIDI.
              </span>
            </div>
          </div>
        )}

        {/* Tab Content: iOS */}
        {activeTab === 'ios' && (
          <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-zinc-800/50 border border-white/10 text-xs">
            <h4 className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
              <span>Como instalar no iPhone ou iPad (iOS Safari):</span>
            </h4>

            <ol className="flex flex-col gap-3 text-zinc-300 list-decimal list-inside">
              <li className="leading-relaxed">
                <strong className="text-white font-semibold">
                  Abra esta página no Safari
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  No iOS, a instalação de PWAs deve ser iniciada pelo navegador nativo Safari da Apple.
                </p>
              </li>

              <li className="leading-relaxed">
                <strong className="text-white font-semibold flex-inline items-center gap-1">
                  Toque no botão Compartilhar
                  <Share2 className="w-3.5 h-3.5 inline text-amber-400 ml-1" />
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  É o ícone quadrado com uma seta apontando para cima na barra inferior do iPhone (ou no topo do iPad).
                </p>
              </li>

              <li className="leading-relaxed">
                <strong className="text-white font-semibold flex-inline items-center gap-1">
                  Role a lista e toque em "Adicionar à Tela de Início"
                  <PlusSquare className="w-3.5 h-3.5 inline text-amber-400 ml-1" />
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  Geralmente está logo abaixo das opções de favoritos e leitura.
                </p>
              </li>

              <li className="leading-relaxed">
                <strong className="text-white font-semibold">
                  Toque em "Adicionar" no canto superior direito
                </strong>
                <p className="text-[11px] text-zinc-400 ml-4 mt-0.5">
                  Pronto! O ícone com o teclado e a câmera estará na sua tela inicial como um app nativo da Apple Store.
                </p>
              </li>
            </ol>

            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-white/10 text-[11px] text-zinc-400">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                No iOS, o app abre sem a barra de URL do Safari, permitindo gravação fluida e visualização imersiva.
              </span>
            </div>
          </div>
        )}

        {/* Benefits Card */}
        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          <div className="p-2 rounded-xl bg-zinc-800/40 border border-white/5">
            <span className="text-[11px] font-bold text-white block">Tela Cheia</span>
            <span className="text-[10px] text-zinc-400">Sem barra do navegador</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-800/40 border border-white/5">
            <span className="text-[11px] font-bold text-white block">Acesso Rápido</span>
            <span className="text-[10px] text-zinc-400">Ícone na tela inicial</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-800/40 border border-white/5">
            <span className="text-[11px] font-bold text-white block">Modo Offline</span>
            <span className="text-[10px] text-zinc-400">Cache inteligente</span>
          </div>
        </div>

        {/* Footer Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition cursor-pointer"
        >
          Entendi / Fechar
        </button>
      </div>
    </div>
  );
};
