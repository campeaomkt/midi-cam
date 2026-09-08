import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'badge' | 'button' | 'settings-item';
  onOpenModalCustom?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'badge',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already running as installed standalone PWA, don't show the install CTA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  if (variant === 'settings-item') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={`w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 to-cyan-950/40 border border-emerald-500/30 hover:border-emerald-400 text-left transition cursor-pointer group ${className}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500 group-hover:text-black transition">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Instalar Aplicativo (PWA)</span>
                <span className="px-1.5 py-0.2 text-[9px] rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                  Android / iOS
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Fixe na tela inicial e use em tela cheia como app nativo
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition">
            Instalar &rarr;
          </span>
        </button>

        <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        id="pwa-install-header-btn"
        onClick={handleClick}
        title="Instalar aplicativo no Android ou iPhone (iOS)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 hover:text-emerald-200 text-xs font-semibold backdrop-blur-md transition shadow-[0_0_12px_rgba(59,245,176,0.2)] cursor-pointer active:scale-95 ${className}`}
      >
        <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="hidden sm:inline">Instalar App</span>
        <span className="sm:hidden">Instalar</span>
      </button>

      <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};
