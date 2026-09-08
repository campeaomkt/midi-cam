import React, { useState, useRef } from 'react';
import { VideoRecording } from '../types';
import {
  X,
  Play,
  Download,
  Trash2,
  Share2,
  Film,
  Clock,
  HardDrive,
  Upload,
  Smartphone,
  Check,
  Sparkles,
} from 'lucide-react';

interface RecordedVideosModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordings: VideoRecording[];
  onDeleteRecording: (id: string) => void;
  onImportMedia?: (file: File) => void;
}

export const RecordedVideosModal: React.FC<RecordedVideosModalProps> = ({
  isOpen,
  onClose,
  recordings,
  onDeleteRecording,
  onImportMedia,
}) => {
  const [selectedVideo, setSelectedVideo] = useState<VideoRecording | null>(
    recordings.length > 0 ? recordings[0] : null
  );
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync selected video if recordings change
  React.useEffect(() => {
    if (recordings.length > 0 && (!selectedVideo || !recordings.some((r) => r.id === selectedVideo.id))) {
      setSelectedVideo(recordings[0]);
    }
  }, [recordings, selectedVideo]);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleShareOrSaveToPhotos = async (rec: VideoRecording) => {
    const isMp4 = rec.blob.type.includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const mimeType = isMp4 ? 'video/mp4' : rec.blob.type || 'video/webm';
    const fileName = `midicam-${rec.timestamp}.${ext}`;

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const file = new File([rec.blob], fileName, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Gravação MIDI Camera',
            text: 'Vídeo gravado com teclado MIDI e cifras em tempo real!',
            files: [file],
          });
          setSaveSuccessMsg('Na folha de compartilhamento do iOS, toque em "Salvar Vídeo" para enviar ao app Fotos!');
          setTimeout(() => setSaveSuccessMsg(null), 5000);
          return;
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Share error, falling back to download:', err);
        }
      }
    }

    // Direct download fallback
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setSaveSuccessMsg('Arquivo de vídeo descarregado!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportMedia) {
      onImportMedia(file);
    }
    // Reset value so same file can be re-selected if needed
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div
      id="recorded-videos-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Hidden File Input for iPhone Gallery / Camera Roll */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-white max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight leading-tight">Galeria de Gravações</h2>
              <p className="text-xs text-zinc-400">{recordings.length} item(ns) disponível(is)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Import from iPhone Photos / Gallery */}
            <button
              type="button"
              id="btn-import-from-gallery"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-cyan-300 hover:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 border border-cyan-500/30 transition cursor-pointer"
              title="Abrir foto ou vídeo da Galeria do seu iPhone"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importar Fotos</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert for iOS Photos save */}
        {saveSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-200 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Active Selected Video Player */}
        {selectedVideo ? (
          <div className="flex flex-col gap-3">
            <div className="relative w-full aspect-[9/16] max-h-[46vh] bg-black rounded-xl overflow-hidden border border-white/15 flex items-center justify-center shadow-lg">
              <video
                key={selectedVideo.id}
                src={selectedVideo.url}
                controls
                autoPlay
                playsInline
                // @ts-ignore
                webkit-playsinline="true"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Video Info & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-zinc-800/70 p-3 rounded-xl border border-white/10 gap-3 text-xs">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    {selectedVideo.duration}s
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-mono text-zinc-400">
                    <HardDrive className="w-3.5 h-3.5" />
                    {formatFileSize(selectedVideo.sizeBytes)}
                  </span>
                  {selectedVideo.filterName && (
                    <>
                      <span>•</span>
                      <span className="text-zinc-400 truncate max-w-[100px]">{selectedVideo.filterName}</span>
                    </>
                  )}
                </div>
                <span className="text-[10px] text-zinc-400">
                  {new Date(selectedVideo.timestamp).toLocaleTimeString('pt-BR')} -{' '}
                  {new Date(selectedVideo.timestamp).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Save directly to iPhone Camera Roll / Share */}
                <button
                  type="button"
                  id="btn-save-iphone-photos"
                  onClick={() => handleShareOrSaveToPhotos(selectedVideo)}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold flex items-center gap-1.5 transition shadow active:scale-95 cursor-pointer text-xs"
                  title="Salvar no Rolo de Fotos do iPhone ou Compartilhar"
                >
                  <Smartphone className="w-4 h-4 stroke-[2.5]" />
                  <span>Salvar no iPhone</span>
                </button>

                {/* Direct Download fallback */}
                <button
                  type="button"
                  onClick={() => {
                    const isMp4 = selectedVideo.blob.type.includes('mp4');
                    const ext = isMp4 ? 'mp4' : 'webm';
                    const a = document.createElement('a');
                    a.href = selectedVideo.url;
                    a.download = `midicam-${selectedVideo.timestamp}.${ext}`;
                    a.click();
                  }}
                  className="p-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white transition cursor-pointer"
                  title="Baixar Arquivo"
                >
                  <Download className="w-4 h-4" />
                </button>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => {
                    onDeleteRecording(selectedVideo.id);
                    const remaining = recordings.filter((r) => r.id !== selectedVideo.id);
                    setSelectedVideo(remaining.length > 0 ? remaining[0] : null);
                  }}
                  className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-300 transition cursor-pointer"
                  title="Excluir Gravação"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tip for iPhone Users */}
            <div className="text-[11px] text-zinc-400 bg-zinc-800/40 p-2.5 rounded-lg border border-white/5 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Dica para iPhone:</strong> Ao tocar em <em>"Salvar no iPhone"</em>, o iOS abre a tela de compartilhamento onde você escolhe <strong>"Salvar Vídeo"</strong> para gravá-lo diretamente no aplicativo Fotos (Galeria).
              </span>
            </div>
          </div>
        ) : (
          <div className="py-10 flex flex-col items-center justify-center text-center gap-3 text-zinc-400">
            <Film className="w-12 h-12 text-zinc-600" />
            <div>
              <p className="text-sm font-semibold text-zinc-300">Nenhum vídeo gravado ainda</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                Toque no botão vermelho na câmera para gravar ou clique no botão abaixo para escolher uma foto/vídeo da galeria do seu iPhone:
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg active:scale-95"
            >
              <Upload className="w-4 h-4" />
              <span>Acessar Galeria do iPhone (Fotos)</span>
            </button>
          </div>
        )}

        {/* Takes List */}
        {recordings.length > 1 && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Outras Gravações</span>
            <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto">
              {recordings.map((rec, index) => {
                const isSelected = selectedVideo?.id === rec.id;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => setSelectedVideo(rec)}
                    className={`relative rounded-lg overflow-hidden border p-1 text-left transition cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-white/10 bg-zinc-800/70 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="w-full aspect-video bg-black rounded overflow-hidden relative flex items-center justify-center">
                      {rec.thumbnailUrl ? (
                        <img src={rec.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover" />
                      ) : (
                        <Play className="w-5 h-5 text-zinc-500" />
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[9px] font-mono">
                        {rec.duration}s
                      </span>
                    </div>
                    <span className="text-[10px] font-medium truncate text-zinc-300">
                      {rec.filterName ? rec.filterName : `Take #${recordings.length - index}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
