import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  Music,
  Upload,
  CheckCircle2,
  Trash2,
  Volume2,
  Sparkles,
  Info,
  Loader2,
  Play,
  FileAudio,
  Radio,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { SoundFontEngine } from '../audio/SoundFontEngine';
import { soundFontLibrary, SoundFontCatalogEntry } from '../audio/soundFontLibrary';
import { useSoundFont } from '../hooks/useSoundFont';
import { audioSynth } from '../utils/audioSynth';
import { unlockAudioContext } from '../utils/iosAudioUnlock';

interface SoundFontManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSoundFontChanged: () => void;
}

export const SoundFontManagerModal: React.FC<SoundFontManagerModalProps> = ({
  isOpen,
  onClose,
  onSoundFontChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [audioState, setAudioState] = useState<AudioContextState>('running');
  const [isDragging, setIsDragging] = useState(false);

  const {
    catalog,
    activeBankName,
    activeId,
    isReady,
    hasSoundFontLoaded,
    isLoading,
    loadProgress,
    volume,
    setVolume,
    selectBank,
    importSoundFont,
    deleteBank,
    panic,
  } = useSoundFont();

  // Reset messages on open
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  // Monitor audio context state
  useEffect(() => {
    if (!isOpen) return;
    try {
      const ctx = audioSynth.getAudioContext();
      setAudioState(ctx.state);
      const interval = setInterval(() => {
        if (ctx) setAudioState(ctx.state);
      }, 1000);
      return () => clearInterval(interval);
    } catch {}
  }, [isOpen]);

  if (!isOpen) return null;

  // Test sound with rich chord & unlock audio
  const handleTestSound = async () => {
    if (isPlayingTest) return;
    if (!hasSoundFontLoaded) {
      setErrorMessage('Nenhum SoundFont (.sf2) carregado. O aplicativo permanece em silêncio (mudo) até que um timbre seja carregado.');
      return;
    }
    setIsPlayingTest(true);

    try {
      const ctx = audioSynth.getAudioContext();
      await unlockAudioContext(ctx);
      setAudioState(ctx.state);

      // Play C Major 9 chord (C4, E4, G4, B4, D5)
      const chord = [60, 64, 67, 71, 74];
      chord.forEach((note, idx) => {
        setTimeout(() => {
          audioSynth.startNote(note, 96);
        }, idx * 60);
      });

      setTimeout(() => {
        chord.forEach((note) => audioSynth.stopNote(note));
      }, 1600);
    } catch (err) {
      console.warn('Test sound error:', err);
    } finally {
      setTimeout(() => {
        setIsPlayingTest(false);
      }, 1800);
    }
  };

  // Handle SF2 File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const ctx = audioSynth.getAudioContext();
      await unlockAudioContext(ctx);

      const entry = await importSoundFont(file);
      const name = entry?.name || file.name.replace(/\.[^/.]+$/, '');
      setSuccessMessage(`Timbre "${name}" importado e ativado automaticamente no FluidSynth!`);
      onSoundFontChanged();
      handleTestSound();
    } catch (err: any) {
      console.error('SF2 Load Error:', err);
      setErrorMessage(
        err?.message || 'Erro ao carregar arquivo SF2. Verifique se o arquivo é um SoundFont (.sf2) válido.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        const ctx = audioSynth.getAudioContext();
        await unlockAudioContext(ctx);
        const entry = await importSoundFont(file);
        const name = entry?.name || file.name.replace(/\.[^/.]+$/, '');
        setSuccessMessage(`Timbre "${name}" importado e ativado automaticamente no FluidSynth!`);
        onSoundFontChanged();
        handleTestSound();
      } catch (err: any) {
        console.error('SF2 Drop Error:', err);
        setErrorMessage(err?.message || 'Erro ao importar arquivo SF2.');
      }
    }
  };

  const handleSelectBank = async (id: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const ctx = audioSynth.getAudioContext();
      await unlockAudioContext(ctx);
      setAudioState(ctx.state);

      await selectBank(id);
      setSuccessMessage('Timbre ativado com sucesso no FluidSynth!');
      onSoundFontChanged();
      handleTestSound();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao selecionar SoundFont.');
    }
  };

  const handleDeleteBank = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteBank(id);
      setSuccessMessage('Banco SoundFont removido.');
      onSoundFontChanged();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao deletar banco.');
    }
  };

  return (
    <div
      id="modal-timbre-manager"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl p-4 sm:p-5 text-white flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Motor de Áudio SF2 FluidSynth
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v2.4.6 WASM
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Amostras autênticas de SoundFont (.sf2) via FluidSynth direto no canal MIDI
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Engine Status & Test Bar */}
        <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${
                hasSoundFontLoaded
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-zinc-600'
              }`}
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white">
                {hasSoundFontLoaded
                  ? 'FluidSynth 2.4.6 Ativo (Motor SF2 Pronto)'
                  : 'Sintetizador Genérico Desativado (Mudo)'}
              </span>
              <span
                className={`text-[11px] font-mono truncate max-w-xs ${
                  hasSoundFontLoaded ? 'text-emerald-300' : 'text-zinc-400'
                }`}
              >
                {hasSoundFontLoaded
                  ? `Timbre Ativo: ${activeBankName}`
                  : 'Nenhum som até carregar um arquivo .sf2'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleTestSound}
              disabled={isPlayingTest || isLoading}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-50 ${
                hasSoundFontLoaded
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-black shadow-md shadow-emerald-400/20'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              }`}
            >
              {isPlayingTest ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Tocando...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Testar Timbre SF2
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => panic()}
              title="Panic (interrompe todas as notas e solta sustain)"
              className="px-3 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Panic
            </button>
          </div>
        </div>

        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Carregando SoundFont no FluidSynth WASM...
              </span>
              <span>{loadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Success / Error Messages */}
        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* SF2 Drag & Drop / Upload Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
            isDragging
              ? 'border-amber-400 bg-amber-400/10'
              : 'border-white/20 hover:border-amber-400/60 bg-zinc-800/40 hover:bg-zinc-800/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".sf2,.SF2,*/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-2xl bg-amber-400/20 text-amber-400 flex items-center justify-center shadow-inner">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Importar seu arquivo SoundFont (.sf2)</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md">
              Arraste seu arquivo .sf2 aqui ou clique para selecionar. Salvo no armazenamento interno do seu aparelho (IndexedDB) para tocar offline.
            </p>
          </div>
          <span className="text-[11px] px-3 py-1 rounded-full bg-white/5 text-zinc-300 border border-white/10 font-mono">
            Formatos suportados: SoundFont 2 (.sf2)
          </span>
        </div>

        {/* SoundFont Banks List */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Bancos SoundFont (.sf2) Importados
            </h3>
            <span className="text-[11px] text-zinc-500">
              {catalog.length} banco(s) importado(s)
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {catalog.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-white/10 bg-zinc-900/40 text-center flex flex-col items-center justify-center gap-2">
                <FileAudio className="w-8 h-8 text-zinc-600" />
                <span className="text-xs font-semibold text-zinc-300">Nenhum banco SoundFont (.sf2) importado</span>
                <span className="text-[11px] text-zinc-500 max-w-sm">
                  Arraste ou clique na área acima para importar seus arquivos .sf2 favoritos direto para a memória do seu app.
                </span>
              </div>
            ) : (
              catalog.map((bank) => {
                const isLoaded = activeId === bank.id && hasSoundFontLoaded;
                const isSelected = activeId === bank.id;
                const sizeMb = (bank.sizeBytes / (1024 * 1024)).toFixed(1);

                return (
                  <div
                    key={bank.id}
                    onClick={() => handleSelectBank(bank.id)}
                    className={`p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                      isLoaded
                        ? 'bg-emerald-400/10 border-emerald-400/50 shadow-md shadow-emerald-400/5'
                        : isSelected
                        ? 'bg-amber-400/10 border-amber-400/40'
                        : 'bg-zinc-800/60 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isLoaded
                            ? 'bg-emerald-400 text-black font-bold'
                            : isSelected
                            ? 'bg-amber-400 text-black font-bold'
                            : 'bg-zinc-700 text-zinc-300'
                        }`}
                      >
                        <FileAudio className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{bank.name}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {sizeMb} MB
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          Importado em {new Date(bank.importedAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isLoaded ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold mr-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Ativo no FluidSynth</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-300/80 mr-2 font-medium">
                          Clique para ativar
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDeleteBank(bank.id, e)}
                        title="Excluir este banco do aparelho"
                        className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-400/10 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Volume & Engine Architecture Details */}
        <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-400" />
              Volume do Sintetizador SF2: {volume}%
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              Gain: {(volume / 100).toFixed(2)} (Clamped 0.01 - 1.5)
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="120"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-amber-400 cursor-pointer"
          />

          <div className="pt-2 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-zinc-400">
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 flex flex-col">
              <span className="text-zinc-500">Motor SF2</span>
              <span className="font-semibold text-zinc-200">FluidSynth 2.4.6</span>
            </div>
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 flex flex-col">
              <span className="text-zinc-500">Polifonia</span>
              <span className="font-semibold text-zinc-200">256 vozes (Web)</span>
            </div>
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 flex flex-col">
              <span className="text-zinc-500">Interpolação</span>
              <span className="font-semibold text-zinc-200">4ª Ordem (Sinc)</span>
            </div>
            <div className="p-2 rounded-lg bg-black/30 border border-white/5 flex flex-col">
              <span className="text-zinc-500">Sustain CC64</span>
              <span className="font-semibold text-zinc-200">Histerese (64/40)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
