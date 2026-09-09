import React, { useRef, useState } from 'react';
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
} from 'lucide-react';
import { sf2Engine, SF2PresetInfo, SF2Metadata } from '../utils/sf2Engine';
import { saveSoundFontToStorage, deleteSoundFontFromStorage } from '../utils/sf2Storage';
import { audioSynth } from '../utils/audioSynth';

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
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  if (!isOpen) return null;

  const isSF2Loaded = sf2Engine.getIsLoaded();
  const soundFontName = sf2Engine.getSoundFontName();
  const metadata: SF2Metadata | null = sf2Engine.getMetadata();
  const presets: SF2PresetInfo[] = sf2Engine.getPresets();
  const activePresetIndex = sf2Engine.getActivePresetIndex();

  // Handle SF2 File Selection from iPhone Files / Android / PC
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const meta = await sf2Engine.loadBuffer(buffer, file.name);

      // Save to IndexedDB so it persists permanently on the phone
      await saveSoundFontToStorage(file.name, buffer, 0);

      setSuccessMessage(
        `Timbre "${meta.name}" carregado com sucesso! (${meta.presetCount} instrumentos, ${(
          meta.fileSizeBytes /
          (1024 * 1024)
        ).toFixed(1)} MB)`
      );
      onSoundFontChanged();
    } catch (err: any) {
      console.error('SF2 Load Error:', err);
      setErrorMessage(err?.message || 'Não foi possível ler o arquivo SF2 selecionado.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectPreset = (index: number) => {
    sf2Engine.selectPreset(index);
    onSoundFontChanged();
    // Play a brief test note so the user can immediately hear the switch
    playTestNote(60);
  };

  const handleRemoveSoundFont = async () => {
    sf2Engine.clearCurrentSoundFont();
    await deleteSoundFontFromStorage();
    setSuccessMessage('Restaurado para o sintetizador padrão integrado.');
    onSoundFontChanged();
  };

  const playTestNote = (midi: number) => {
    audioSynth.startNote(midi, 100);
    setTimeout(() => {
      audioSynth.stopNote(midi);
    }, 500);
  };

  const handleTestChord = () => {
    if (isPlayingTest) return;
    setIsPlayingTest(true);

    // C Major 7 preview: C4 (60), E4 (64), G4 (67), B4 (71)
    const chordNotes = [60, 64, 67, 71];
    chordNotes.forEach((note, i) => {
      setTimeout(() => {
        audioSynth.startNote(note, 95);
      }, i * 60);
    });

    setTimeout(() => {
      chordNotes.forEach((note) => {
        audioSynth.stopNote(note);
      });
      setIsPlayingTest(false);
    }, 1600);
  };

  return (
    <div
      id="modal-soundfont-manager"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl p-5 text-white flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Motor de Som & Timbres (.sf2)</h2>
              <p className="text-xs text-zinc-400">
                Toque amostras reais (.sf2) no teclado MIDI ou virtual
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Sound Status Banner */}
        <div
          className={`p-4 rounded-xl border transition ${
            isSF2Loaded
              ? 'bg-emerald-950/40 border-emerald-500/30'
              : 'bg-zinc-800/60 border-white/10'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isSF2Loaded
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-400/20 text-amber-400'
                }`}
              >
                {isSF2Loaded ? <Sparkles className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Fonte de Som Ativa:
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSF2Loaded
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    }`}
                  >
                    {isSF2Loaded ? 'Amostras Reais SF2' : 'Sintetizador Integrado'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {isSF2Loaded ? soundFontName : 'Piano Digital Estéreo (Sintetizador Padrão)'}
                </h3>
                {metadata && (
                  <p className="text-[11px] text-zinc-300 mt-1">
                    {metadata.presetCount} instrumento(s) •{' '}
                    {(metadata.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB • Salvo na memória do
                    celular
                  </p>
                )}
              </div>
            </div>

            {/* Test Note / Chord Button */}
            <button
              type="button"
              onClick={handleTestChord}
              disabled={isPlayingTest}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border border-white/10 shrink-0 cursor-pointer disabled:opacity-50"
              title="Testar Som"
            >
              <Play className="w-3.5 h-3.5 fill-amber-400" />
              <span>{isPlayingTest ? 'Tocando...' : 'Testar'}</span>
            </button>
          </div>

          {/* Active Preset Selector if SF2 has multiple instruments */}
          {isSF2Loaded && presets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-500/20">
              <label className="text-xs font-semibold text-emerald-200 block mb-1.5">
                Escolha o Instrumento / Preset:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {presets.map((preset) => {
                  const isSelected = preset.index === activePresetIndex;
                  return (
                    <button
                      key={preset.index}
                      type="button"
                      onClick={() => handleSelectPreset(preset.index)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-black font-bold shadow-md'
                          : 'bg-black/40 hover:bg-zinc-800 text-zinc-300 border border-white/10'
                      }`}
                    >
                      <span className="truncate">{preset.name}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-black" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Success / Error alerts */}
        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <Info className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Upload Action Card */}
        <div className="flex flex-col gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".sf2,.soundfont"
            className="hidden"
          />

          <button
            type="button"
            id="btn-upload-sf2"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 rounded-xl border-2 border-dashed border-amber-400/40 hover:border-amber-400 bg-amber-400/10 hover:bg-amber-400/15 transition flex flex-col items-center justify-center gap-2 text-center cursor-pointer group disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                <span className="text-xs font-bold text-amber-300">
                  Decodificando amostras PCM do arquivo SF2...
                </span>
                <span className="text-[11px] text-zinc-400">Isso pode levar alguns segundos.</span>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-amber-400/20 group-hover:bg-amber-400/30 text-amber-400 flex items-center justify-center transition">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white group-hover:text-amber-300 transition">
                    Carregar Arquivo .sf2 do Celular ou PC
                  </span>
                  <span className="text-xs text-zinc-400 mt-0.5">
                    No iPhone, abre o app Arquivos (Downloads, iCloud Drive, etc.)
                  </span>
                </div>
              </>
            )}
          </button>

          {/* Remove / Reset Button */}
          {isSF2Loaded && (
            <button
              type="button"
              onClick={handleRemoveSoundFont}
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-rose-300 border border-white/10 text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover Timbre e Voltar para Sintetizador Padrão</span>
            </button>
          )}
        </div>

        {/* Helpful Tips Section */}
        <div className="p-3.5 rounded-xl bg-zinc-800/40 border border-white/10 flex flex-col gap-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
            <FileAudio className="w-3.5 h-3.5 text-amber-400" />
            <span>Como usar timbres no iPhone:</span>
          </div>
          <p>
            1. Baixe qualquer arquivo de SoundFont 2 (extensão <code className="text-amber-300">.sf2</code>) no Safari do seu celular (ex: <i>Grand Piano, Rhodes, Cordas, Sanfona/Acordeon</i>).
          </p>
          <p>
            2. Toque no botão acima e selecione o arquivo baixado no app <b>Arquivos &gt; Downloads</b> do iPhone.
          </p>
          <p>
            3. O som fica salvo na memória permanente do seu celular e é mixado diretamente nas gravações de vídeo em alta fidelidade.
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs transition cursor-pointer"
        >
          Concluir
        </button>
      </div>
    </div>
  );
};
