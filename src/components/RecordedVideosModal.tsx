import React, { useState } from 'react';
import { VideoRecording } from '../types';
import { X, Play, Download, Trash2, Share2, Film, Clock, HardDrive } from 'lucide-react';

interface RecordedVideosModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordings: VideoRecording[];
  onDeleteRecording: (id: string) => void;
}

export const RecordedVideosModal: React.FC<RecordedVideosModalProps> = ({
  isOpen,
  onClose,
  recordings,
  onDeleteRecording,
}) => {
  const [selectedVideo, setSelectedVideo] = useState<VideoRecording | null>(
    recordings.length > 0 ? recordings[0] : null
  );

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleShare = async (rec: VideoRecording) => {
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([rec.blob], `midi-take-${rec.timestamp}.webm`, { type: rec.blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Gravação MIDI Camera',
            text: 'Confira meu vídeo gravado com teclado MIDI e cifras em tempo real!',
            files: [file],
          });
          return;
        }
      } catch {
        // fallback to download
      }
    }

    // Direct download fallback
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = `midi-video-${new Date(rec.timestamp).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
    a.click();
  };

  return (
    <div
      id="recorded-videos-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/20 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-white max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold tracking-tight">Vídeos Gravados</h2>
              <p className="text-xs text-zinc-400">{recordings.length} gravação(ões) salva(s)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Selected Video Player */}
        {selectedVideo ? (
          <div className="flex flex-col gap-3">
            <div className="relative w-full aspect-[9/16] max-h-[48vh] bg-black rounded-xl overflow-hidden border border-white/15 flex items-center justify-center shadow-lg">
              <video
                key={selectedVideo.id}
                src={selectedVideo.url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            {/* Video Info & Actions */}
            <div className="flex items-center justify-between bg-zinc-800/60 p-3 rounded-xl border border-white/10 text-xs">
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
                </div>
                <span className="text-[10px] text-zinc-400">
                  {new Date(selectedVideo.timestamp).toLocaleTimeString('pt-BR')} - {new Date(selectedVideo.timestamp).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <a
                  href={selectedVideo.url}
                  download={`midi-take-${selectedVideo.timestamp}.webm`}
                  className="p-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-bold flex items-center gap-1 transition shadow"
                  title="Baixar Vídeo"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs">Baixar</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleShare(selectedVideo)}
                  className="p-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition"
                  title="Compartilhar"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteRecording(selectedVideo.id);
                    const remaining = recordings.filter(r => r.id !== selectedVideo.id);
                    setSelectedVideo(remaining.length > 0 ? remaining[0] : null);
                  }}
                  className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-300 transition"
                  title="Excluir Vídeo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-3 text-zinc-400">
            <Film className="w-12 h-12 text-zinc-600" />
            <div>
              <p className="text-sm font-semibold text-zinc-300">Nenhum vídeo gravado ainda</p>
              <p className="text-xs text-zinc-500 mt-1">
                Toque no botão vermelho da câmera para gravar seu primeiro take!
              </p>
            </div>
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
                      Take #{recordings.length - index}
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
