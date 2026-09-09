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
  VolumeX,
} from 'lucide-react';
import { sf2Engine, SF2PresetInfo, SF2Metadata } from '../utils/sf2Engine';
import { saveSoundFontToStorage, deleteSoundFontFromStorage } from '../utils/sf2Storage';
import { audioSynth } from '../utils/audioSynth';
import { timbreEngine, BUILTIN_INSTRUMENTS, TimbrePreset } from '../utils/timbreEngine';
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
  const [activeTab, setActiveTab] = useState<'builtin' | 'custom_sf2'>('builtin');
  const [isLoadingSF2, setIsLoadingSF2] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [audioState, setAudioState] = useState<AudioContextState>('running');

  // Sync with timbre engine
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = timbreEngine.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

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

  const activeTimbreId = timbreEngine.getActiveTimbreId();
  const timbreMode = timbreEngine.getMode();
  const isLoadingTimbre = timbreEngine.getIsLoading();
  const loadingProgress = timbreEngine.getLoadingProgress();

  const isSF2Loaded = sf2Engine.getIsLoaded();
  const soundFontName = sf2Engine.getSoundFontName();
  const metadata: SF2Metadata | null = sf2Engine.getMetadata();
  const presets: SF2PresetInfo[] = sf2Engine.getPresets();
  const activePresetIndex = sf2Engine.getActivePresetIndex();

  // Test sound with chord & unlock audio
  const handleTestSound = async () => {
    if (isPlayingTest) return;
    setIsPlayingTest(true);

    try {
      const ctx = audioSynth.getAudioContext();
      await unlockAudioContext(ctx);
      setAudioState(ctx.state);

      await timbreEngine.playTestChord();
    } catch (err) {
      console.warn('Test sound error:', err);
    } finally {
      setTimeout(() => {
        setIsPlayingTest(false);
      }, 1400);
    }
  };

  // Select a built-in studio instrument
  const handleSelectBuiltin = async (inst: TimbrePreset) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const ctx = audioSynth.getAudioContext();
    await unlockAudioContext(ctx);

    await timbreEngine.setTimbre(inst.id);
    onSoundFontChanged();

    // Play a single note to verify
    setTimeout(() => {
      timbreEngine.playNote(60, 95);
      setTimeout(() => timbreEngine.stopNote(60), 600);
    }, 100);
  };

  // Handle SF2 File Selection (accepting */* so iOS Safari never greys out the file)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingSF2(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const ctx = audioSynth.getAudioContext();
      await unlockAudioContext(ctx);

      const buffer = await file.arrayBuffer();
      const meta = await sf2Engine.loadBuffer(buffer, file.name);

      // Save to IndexedDB so it persists on the device
      await saveSoundFontToStorage(file.name, buffer, 0);

      // Switch timbre mode to custom_sf2
      await timbreEngine.setTimbre('custom_sf2');

      setSuccessMessage(
        `SoundFont "${meta.name}" carregado com sucesso! (${meta.presetCount} instrumentos, ${(
          meta.fileSizeBytes /
          (1024 * 1024)
        ).toFixed(1)} MB)`
      );
      onSoundFontChanged();

      // Play test chord
      handleTestSound();
    } catch (err: any) {
      console.error('SF2 Load Error:', err);
      setErrorMessage(
        err?.message ||
          'Não foi possível ler o arquivo. Certifique-se de selecionar um arquivo com extensão .sf2 descompactado.'
      );
    } finally {
      setIsLoadingSF2(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectPreset = (index: number) => {
    sf2Engine.selectPreset(index);
    onSoundFontChanged();

    // Play a test note
    timbreEngine.playNote(60, 95);
    setTimeout(() => timbreEngine.stopNote(60), 600);
  };

  const handleRemoveSoundFont = async () => {
    sf2Engine.clearCurrentSoundFont();
    await deleteSoundFontFromStorage();
    await timbreEngine.setTimbre('acoustic_grand_piano');
    setSuccessMessage('Restaurado para o Piano de Cauda Acústico.');
    onSoundFontChanged();
  };

  return (
    <div
      id="modal-timbre-manager"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl p-4 sm:p-5 text-white flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Central de Timbres & Sons</h2>
              <p className="text-xs text-zinc-400">
                Amostras reais de alta fidelidade para teclado MIDI e virtual
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

        {/* Audio Engine Status & Test Bar */}
        <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${
                audioState === 'running'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white">
                {audioState === 'running'
                  ? 'Motor de Áudio Ativo no Aparelho'
                  : 'Áudio em Espera (Toque para Ativar)'}
              </span>
              <span className="text-[11px] text-zinc-400">
                {timbreMode === 'custom_sf2'
                  ? `Arquivo SF2: ${soundFontName || 'Personalizado'}`
                  : `Timbre: ${timbreEngine.getActiveTimbreName()}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestSound}
            disabled={isPlayingTest}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer disabled:opacity-50 shrink-0 shadow-md shadow-amber-400/20"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>{isPlayingTest ? 'Tocando Acorde...' : 'Ouvir Teste de Som'}</span>
          </button>
        </div>

        {/* iPhone Silent Switch Warning Alert */}
        <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-start gap-2.5 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-amber-300">
              Atenção para usuários de iPhone (iOS):
            </span>
            <span className="text-[11px] leading-relaxed text-amber-200/90">
              Se o som não sair nos alto-falantes do iPhone,{' '}
              <b>desative a chave física de silêncio lateral do iPhone</b> (coloque para frente, sem
              a marca laranja) ou conecte fones de ouvido.
            </span>
          </div>
        </div>

        {/* Tab Switcher: Prontos vs Meu SF2 */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('builtin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'builtin'
                ? 'bg-amber-400 text-black shadow-sm'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Timbres Prontos (1 Toque)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom_sf2')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'custom_sf2'
                ? 'bg-amber-400 text-black shadow-sm'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Carregar Meu Arquivo .sf2</span>
            {isSF2Loaded && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            )}
          </button>
        </div>

        {/* TAB 1: BUILT-IN STUDIO SAMPLED INSTRUMENTS */}
        {activeTab === 'builtin' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Instrumentos Amostrados de Estúdio:
              </span>
              {isLoadingTimbre && (
                <span className="text-xs text-amber-400 font-medium flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {loadingProgress}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BUILTIN_INSTRUMENTS.map((inst) => {
                const isSelected = timbreMode !== 'custom_sf2' && activeTimbreId === inst.id;
                return (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => handleSelectBuiltin(inst)}
                    className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400/20 border-amber-400 text-white shadow-md shadow-amber-400/10'
                        : 'bg-zinc-850 hover:bg-zinc-800 border-white/10 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-2xl shrink-0 mt-0.5">{inst.icon}</span>
                      <div className="flex flex-col">
                        <span
                          className={`text-xs font-bold ${
                            isSelected ? 'text-amber-300' : 'text-white'
                          }`}
                        >
                          {inst.name}
                        </span>
                        <span className="text-[11px] text-zinc-400 leading-tight mt-0.5">
                          {inst.description}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOM SF2 FILE UPLOAD */}
        {activeTab === 'custom_sf2' && (
          <div className="flex flex-col gap-3">
            {/* Active SF2 Banner if loaded */}
            {isSF2Loaded ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <FileAudio className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        SoundFont Carregado:
                      </span>
                      <h4 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                        {soundFontName}
                      </h4>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await timbreEngine.setTimbre('custom_sf2');
                      onSoundFontChanged();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      timbreMode === 'custom_sf2'
                        ? 'bg-emerald-500 text-black'
                        : 'bg-zinc-800 text-emerald-400 hover:bg-zinc-700'
                    }`}
                  >
                    {timbreMode === 'custom_sf2' ? 'Ativo' : 'Ativar Este SF2'}
                  </button>
                </div>

                {metadata && (
                  <p className="text-[11px] text-zinc-300">
                    {metadata.presetCount} instrumento(s) •{' '}
                    {(metadata.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB • Salvo na memória do
                    aparelho
                  </p>
                )}

                {/* Presets Grid */}
                {presets.length > 0 && (
                  <div className="pt-2 border-t border-emerald-500/20">
                    <label className="text-xs font-semibold text-emerald-200 block mb-1.5">
                      Instrumento do SoundFont:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
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
                            {isSelected && (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-black" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Remove SF2 Button */}
                <button
                  type="button"
                  onClick={handleRemoveSoundFont}
                  className="mt-1 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover este SoundFont</span>
                </button>
              </div>
            ) : null}

            {/* Upload Input - accepts all files so iOS Files app never greys out the file */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="*/*"
              className="hidden"
            />

            <button
              type="button"
              id="btn-upload-sf2"
              disabled={isLoadingSF2}
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-4 rounded-xl border-2 border-dashed border-amber-400/40 hover:border-amber-400 bg-amber-400/10 hover:bg-amber-400/15 transition flex flex-col items-center justify-center gap-2 text-center cursor-pointer group disabled:opacity-50"
            >
              {isLoadingSF2 ? (
                <>
                  <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                  <span className="text-xs font-bold text-amber-300">
                    Processando e indexando amostras do SoundFont...
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Pode levar alguns segundos conforme o tamanho do arquivo.
                  </span>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-amber-400/20 group-hover:bg-amber-400/30 text-amber-400 flex items-center justify-center transition">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white group-hover:text-amber-300 transition">
                      {isSF2Loaded
                        ? 'Carregar Outro Arquivo .sf2'
                        : 'Selecionar Arquivo .sf2 do Celular ou PC'}
                    </span>
                    <span className="text-xs text-zinc-400 mt-0.5">
                      No iPhone, abre o app Arquivos (Downloads, iCloud Drive)
                    </span>
                  </div>
                </>
              )}
            </button>

            {/* Instructions */}
            <div className="p-3 rounded-xl bg-zinc-800/40 border border-white/10 text-[11px] text-zinc-400 flex flex-col gap-1.5">
              <span className="font-bold text-zinc-300">O que é um arquivo .sf2?</span>
              <p>
                Arquivos <code className="text-amber-300">.sf2</code> (SoundFont 2) contêm gravações de notas reais de instrumentos.
              </p>
              <p>
                <b>Importante:</b> Se você baixar um pacote compactado em <code>.zip</code> ou <code>.sf3</code>, descompacte para extrair o arquivo <code>.sf2</code> antes de carregar aqui.
              </p>
            </div>
          </div>
        )}

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

        {/* Close / Done Button */}
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
