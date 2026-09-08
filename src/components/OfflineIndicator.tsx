import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="pwa-offline-badge"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-500/90 backdrop-blur-md px-3 py-1 text-xs font-semibold text-black shadow-lg animate-in fade-in slide-in-from-top-2"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>Modo Offline — Teclado e áudio funcionando localmente</span>
    </div>
  );
};
