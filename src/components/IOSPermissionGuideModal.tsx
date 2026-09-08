import React from 'react';
import { X, Camera, Image, Settings, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';

interface IOSPermissionGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetryCamera: () => void;
}

export const IOSPermissionGuideModal: React.FC<IOSPermissionGuideModalProps> = ({
  isOpen,
  onClose,
  onRetryCamera,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="ios-permission-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-zinc-900/95 border border-white/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 p-2 flex items-center justify-center text-white shadow-lg">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Câmera e Galeria no iPhone</h3>
              <p className="text-xs text-zinc-400">Como autorizar o acesso no iOS</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Note: iOS PWA camera support */}
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="block text-emerald-300 font-bold mb-0.5">
              Sim! O iPhone suporta Câmera e Galeria em PWA!
            </strong>
            A Apple (iOS 14.3+) permite acesso total à câmera, microfone e rolo de fotos para web aplicativos instalados na tela inicial.
          </div>
        </div>

        {/* Step-by-step instructions for iPhone */}
        <div className="flex flex-col gap-3 text-xs">
          <h4 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <span>Passo a Passo para Ativar nos Ajustes do iPhone:</span>
          </h4>

          <div className="flex flex-col gap-2.5">
            {/* Step 1 */}
            <div className="p-3 rounded-xl bg-zinc-800/70 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-400 text-black font-extrabold flex items-center justify-center shrink-0 text-xs">
                1
              </div>
              <div className="flex flex-col gap-0.5 text-zinc-300 leading-relaxed">
                <strong className="text-white font-semibold">Abra o aplicativo "Ajustes" ⚙️ no seu iPhone</strong>
                <span>Na tela de início do iOS, toque no ícone cinza de Ajustes.</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-xl bg-zinc-800/70 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-400 text-black font-extrabold flex items-center justify-center shrink-0 text-xs">
                2
              </div>
              <div className="flex flex-col gap-0.5 text-zinc-300 leading-relaxed">
                <strong className="text-white font-semibold">Role a lista para baixo e toque em "Safari"</strong>
                <span className="text-[11px] text-zinc-400">
                  (Se aparecer o ícone do aplicativo <strong>MIDICam</strong> diretamente na lista de aplicativos dos Ajustes, toque nele).
                </span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-xl bg-zinc-800/70 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-400 text-black font-extrabold flex items-center justify-center shrink-0 text-xs">
                3
              </div>
              <div className="flex flex-col gap-0.5 text-zinc-300 leading-relaxed">
                <strong className="text-white font-semibold">Procure "Acesso à Câmera" e marque "Permitir"</strong>
                <span className="text-[11px] text-zinc-400">
                  Em Ajustes do Safari &rarr; role até a seção <strong>Ajustes para Sites</strong> &rarr; toque em <strong>Câmera</strong> &rarr; escolha <strong>Permitir</strong> ou <strong>Perguntar</strong>.
                </span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-3 rounded-xl bg-zinc-800/70 border border-white/10 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-400 text-black font-extrabold flex items-center justify-center shrink-0 text-xs">
                4
              </div>
              <div className="flex flex-col gap-0.5 text-zinc-300 leading-relaxed">
                <strong className="text-white font-semibold">Volte ao app e toque no botão abaixo</strong>
                <span>Ao tocar no botão, o iOS exibirá a confirmação nativa de acesso ao sensor de vídeo.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Gallery / Photos Tip */}
        <div className="p-3 rounded-xl bg-zinc-800/50 border border-white/10 flex items-start gap-2.5 text-xs text-zinc-300">
          <Image className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white font-semibold block">Acesso à Galeria de Fotos:</strong>
            Você pode tocar no botão <strong className="text-cyan-300">"Importar da Galeria"</strong> no menu de gravações para abrir o rolo de fotos do seu iPhone e carregar vídeos ou imagens direto na tela.
          </div>
        </div>

        {/* Action Button: Retry Camera with User Gesture */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onRetryCamera();
          }}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(251,191,36,0.3)] transition active:scale-[0.98] cursor-pointer"
        >
          <Camera className="w-4 h-4 stroke-[2.5]" />
          <span>Tocar para Iniciar Câmera do iPhone</span>
        </button>
      </div>
    </div>
  );
};
