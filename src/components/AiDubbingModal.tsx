import React, { useState, useEffect, useRef } from 'react';
import { VideoRecording } from '../types';
import {
  X,
  Sparkles,
  Key,
  Mic,
  Languages,
  Volume2,
  Film,
  Play,
  RotateCcw,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
  ChevronRight,
  Eye,
  Edit3,
  Gauge,
  Timer,
  Pause,
  ListOrdered,
} from 'lucide-react';
import {
  DubbingConfig,
  DubbingStepStatus,
  TranscriptionResult,
  SpeechSegment,
  getStoredDubbingConfig,
  saveStoredDubbingConfig,
  extractAudioFromVideoBlob,
  transcribeAudioWhisper,
  extractWhisperSegments,
  processAndGroupWhisperSegments,
  translateSegmentsGPT,
  generateMultiSegmentSpeechTTS,
  composeMultiSegmentMasterTrack,
  assembleDubbedVideo,
} from '../utils/aiDubbingService';

interface AiDubbingModalProps {
  isOpen: boolean;
  onClose: () => void;
  recording: VideoRecording | null;
  onDubbingComplete?: (newDubbedRecording: VideoRecording) => void;
}

export const AiDubbingModal: React.FC<AiDubbingModalProps> = ({
  isOpen,
  onClose,
  recording,
  onDubbingComplete,
}) => {
  const [config, setConfig] = useState<DubbingConfig>(() => getStoredDubbingConfig());
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Stepper State
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = idle, 1..5 = processing
  const [stepStatuses, setStepStatuses] = useState<DubbingStepStatus[]>([
    { step: 1, title: 'Extraindo áudio do vídeo gravado', status: 'pending' },
    { step: 2, title: 'Transcrevendo áudio em Português (Whisper)', status: 'pending' },
    { step: 3, title: 'Traduzindo copy para Espanhol persuasivo (GPT-4o-mini)', status: 'pending' },
    { step: 4, title: 'Gerando áudio em Espanhol (TTS)', status: 'pending' },
    { step: 5, title: 'Montando vídeo dublado final', status: 'pending' },
  ]);

  // Content state
  const [originalAudioBlob, setOriginalAudioBlob] = useState<Blob | null>(null);
  const [transcribedTextPt, setTranscribedTextPt] = useState<string>('');
  const [translatedTextEs, setTranslatedTextEs] = useState<string>('');
  const [speechSegments, setSpeechSegments] = useState<SpeechSegment[]>([]);
  const [scriptViewTab, setScriptViewTab] = useState<'segments' | 'full'>('segments');
  const [generatedAudioBlob, setGeneratedAudioBlob] = useState<Blob | null>(null);
  const [transcriptionInfo, setTranscriptionInfo] = useState<TranscriptionResult | null>(null);
  const [appliedSpeechSpeed, setAppliedSpeechSpeed] = useState<number>(1.0);
  const [dubbedVideoResult, setDubbedVideoResult] = useState<{
    blob: Blob;
    url: string;
    duration: number;
  } | null>(null);

  // Operation state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRegeneratingTTS, setIsRegeneratingTTS] = useState<boolean>(false);
  const [isReassemblingVideo, setIsReassemblingVideo] = useState<boolean>(false);
  const [assemblyProgress, setAssemblyProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dubbed' | 'original' | 'compare'>('dubbed');

  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load config on mount
  useEffect(() => {
    const loaded = getStoredDubbingConfig();
    setConfig(loaded);
    setApiKeyInput(loaded.apiKey);
    if (!loaded.apiKey) {
      setShowConfigPanel(true);
    }
  }, [isOpen]);

  // If open without recording, allow configuring API key or choosing video
  if (!isOpen) return null;

  const handleSaveApiKey = () => {
    const updated = { ...config, apiKey: apiKeyInput.trim() };
    setConfig(updated);
    saveStoredDubbingConfig(updated);
    setShowConfigPanel(false);
  };

  const handleVoiceChange = (voice: DubbingConfig['voice']) => {
    const updated = { ...config, voice };
    setConfig(updated);
    saveStoredDubbingConfig(updated);
  };

  const handleModelChange = (model: DubbingConfig['model']) => {
    const updated = { ...config, model };
    setConfig(updated);
    saveStoredDubbingConfig(updated);
  };

  const handleSpeedModeChange = (speedMode: 'auto' | 'custom', customSpeed?: number) => {
    const updated = { ...config, speedMode, customSpeed: customSpeed ?? config.customSpeed ?? 1.0 };
    setConfig(updated);
    saveStoredDubbingConfig(updated);
  };

  const handleSpeechOffsetChange = (speechOffset: number) => {
    const updated = { ...config, speechOffset };
    setConfig(updated);
    saveStoredDubbingConfig(updated);
  };

  const updateStep = (
    stepNum: 1 | 2 | 3 | 4 | 5,
    status: 'pending' | 'in-progress' | 'completed' | 'error',
    message?: string
  ) => {
    setStepStatuses((prev) =>
      prev.map((s) => (s.step === stepNum ? { ...s, status, message } : s))
    );
  };

  // Update individual segment translation
  const handleSegmentTextChange = (id: number, newText: string) => {
    const updated = speechSegments.map((s) => (s.id === id ? { ...s, translatedText: newText } : s));
    setSpeechSegments(updated);
    setTranslatedTextEs(updated.map((s) => s.translatedText || '').join(' '));
  };

  // Update full text
  const handleFullTextChange = (newFullText: string) => {
    setTranslatedTextEs(newFullText);
    if (speechSegments.length <= 1 && speechSegments.length > 0) {
      setSpeechSegments([{ ...speechSegments[0], translatedText: newFullText }]);
    }
  };

  // Full Pipeline Execution
  const handleStartDubbingPipeline = async () => {
    if (!recording) {
      setErrorMessage('Nenhum vídeo selecionado ainda. Grave um vídeo na câmera ou importe um vídeo na Galeria antes de processar.');
      return;
    }

    if (!config.apiKey) {
      setShowConfigPanel(true);
      setErrorMessage('Por favor, informe sua OpenAI API Key para iniciar a dublagem.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setDubbedVideoResult(null);

    // Reset steps
    setStepStatuses([
      { step: 1, title: 'Extraindo áudio da gravação', status: 'pending' },
      { step: 2, title: 'Transcrevendo por segmentos {start, end} (Whisper)', status: 'pending' },
      { step: 3, title: 'Traduzindo frases com restrição de tempo (GPT-4o-mini)', status: 'pending' },
      { step: 4, title: 'Gerando TTS por frase com ajuste até 1.15x', status: 'pending' },
      { step: 5, title: 'Montando áudio mestre com pausas em silêncio e vídeo final', status: 'pending' },
    ]);

    try {
      // Step 1: Extract Audio & Detect Voice Activity (VAD)
      setCurrentStep(1);
      updateStep(1, 'in-progress', 'Analisando vídeo e detectando pausas acústicas...');
      const extraction = await extractAudioFromVideoBlob(recording.blob);
      setOriginalAudioBlob(extraction.audioBlob);
      updateStep(
        1,
        'completed',
        extraction.vad.hasLeadingPause
          ? `Pausa inicial detectada: ${extraction.vad.speechStartTime.toFixed(1)}s (Vídeo total: ${extraction.totalDuration.toFixed(1)}s)`
          : `Áudio analisado (${extraction.totalDuration.toFixed(1)}s)`
      );

      // Step 2: Transcribe Whisper with verbose_json and timestamp_granularities: ["segment"]
      setCurrentStep(2);
      updateStep(2, 'in-progress', 'Mapeando segmentos temporais com Whisper (/v1/audio/transcriptions)...');
      const transResult = await transcribeAudioWhisper(extraction.audioBlob, config.apiKey, extraction.vad);
      if (!transResult.text) {
        throw new Error('Nenhuma fala detectada no vídeo. Certifique-se de que o microfone estava ativo durante a gravação.');
      }
      setTranscribedTextPt(transResult.text);
      setTranscriptionInfo(transResult);

      const exactVideoDuration = Math.max(
        1,
        recording.duration > 0 ? recording.duration : extraction.totalDuration
      );

      // Extract Whisper segments: { id, start, end, duration = end - start, originalText }
      const segments = extractWhisperSegments(
        transResult.segments,
        transResult.text,
        exactVideoDuration
      );
      setSpeechSegments(segments);

      const pauseCount = Math.max(0, segments.length - 1);
      updateStep(
        2,
        'completed',
        `${segments.length} segmento(s) mapeado(s) {start, end} | ${pauseCount} pausa(s) natural(is)`
      );

      // Step 3: Translate with GPT-4o-mini phrase-by-phrase with duration constraint
      setCurrentStep(3);
      updateStep(3, 'in-progress', 'Traduzindo frases para caber na duração exata de cada segmento...');
      const translatedSegments = await translateSegmentsGPT(segments, config.apiKey, exactVideoDuration);
      setSpeechSegments(translatedSegments);

      const fullSpanishText = translatedSegments.map((s) => s.translatedText || s.originalText).join(' ');
      setTranslatedTextEs(fullSpanishText);
      updateStep(3, 'completed', `${translatedSegments.length} frase(s) traduzida(s) no tempo exato`);

      // Step 4: Generate Voice for each segment with OpenAI TTS (1.0x or slight pitch-preserving speed up to 1.15x)
      setCurrentStep(4);
      updateStep(4, 'in-progress', 'Gerando áudio TTS por frase com ajuste até 1.15x se necessário...');
      const ttsResult = await generateMultiSegmentSpeechTTS(
        translatedSegments,
        config.apiKey,
        config.voice,
        config.model,
        exactVideoDuration,
        config.speedMode === 'custom' ? config.customSpeed : undefined
      );
      setSpeechSegments(ttsResult.segments);
      setAppliedSpeechSpeed(ttsResult.averageSpeed);
      updateStep(
        4,
        'completed',
        `${ttsResult.segments.length} áudio(s) gerado(s) individualmente (ajuste leve até 1.15x se ultrapassar)`
      );

      // Step 5: Compose master audio track placing phrases at exact timestamps and assemble video
      setCurrentStep(5);
      updateStep(5, 'in-progress', 'Posicionando áudios no start exato e preenchendo pausas com silêncio...');
      setAssemblyProgress(0);

      const { masterBlob } = await composeMultiSegmentMasterTrack(
        ttsResult.segments,
        exactVideoDuration,
        config.speechOffset
      );
      setGeneratedAudioBlob(masterBlob);

      const assembled = await assembleDubbedVideo(
        recording.blob || recording.url,
        masterBlob,
        {
          exactVideoDuration,
          masterAudioBlob: masterBlob,
          speechOffset: config.speechOffset,
          onProgress: (pct) => setAssemblyProgress(pct),
        }
      );
      setDubbedVideoResult(assembled);
      updateStep(5, 'completed', `Vídeo dublado pronto! (${assembled.duration}s 100% preservados, início e pausas respeitados)`);

      // Notify parent/storage
      const newRec: VideoRecording = {
        id: `dubbed-${Date.now()}`,
        url: assembled.url,
        blob: assembled.blob,
        duration: assembled.duration,
        timestamp: Date.now(),
        thumbnailUrl: recording.thumbnailUrl,
        sizeBytes: assembled.blob.size,
        filterName: `${recording.filterName || 'Take'} (Doblado ES)`,
      };
      onDubbingComplete?.(newRec);
    } catch (err: any) {
      console.error('Dubbing Pipeline Error:', err);
      const msg = err?.message || 'Erro desconhecido durante o processamento da dublagem.';
      setErrorMessage(msg);
      if (currentStep >= 1 && currentStep <= 5) {
        updateStep(currentStep as any, 'error', msg);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Regenerate TTS if user edited translatedTextEs or segments
  const handleRegenerateTTS = async () => {
    if (!config.apiKey) {
      setShowConfigPanel(true);
      setErrorMessage('Informe a sua OpenAI API Key.');
      return;
    }

    setIsRegeneratingTTS(true);
    setErrorMessage(null);
    try {
      updateStep(4, 'in-progress', 'Regerando áudio com sincronia de pausas...');
      const exactVideoDuration = Math.max(
        1,
        recording.duration > 0 ? recording.duration : (transcriptionInfo?.duration ?? 15)
      );

      let targetSegments = speechSegments;
      if (targetSegments.length === 0) {
        const textToUse = translatedTextEs.trim() || transcribedTextPt;
        if (!textToUse) {
          throw new Error('Nenhum texto para narrar.');
        }
        targetSegments = [
          {
            id: 0,
            start: transcriptionInfo?.speechStartTime ?? 0,
            end: transcriptionInfo?.speechEndTime ?? exactVideoDuration,
            duration: Math.max(1, exactVideoDuration - (transcriptionInfo?.speechStartTime ?? 0)),
            originalText: transcribedTextPt,
            translatedText: textToUse,
          },
        ];
      }

      const ttsResult = await generateMultiSegmentSpeechTTS(
        targetSegments,
        config.apiKey,
        config.voice,
        config.model,
        exactVideoDuration,
        config.speedMode === 'custom' ? config.customSpeed : undefined
      );
      setSpeechSegments(ttsResult.segments);
      setAppliedSpeechSpeed(ttsResult.averageSpeed);
      updateStep(4, 'completed', `${ttsResult.segments.length} frase(s) regerada(s) em 1.0x com pausas`);

      // Re-compose master audio track with all pauses
      const { masterBlob } = await composeMultiSegmentMasterTrack(
        ttsResult.segments,
        exactVideoDuration,
        config.speechOffset
      );
      setGeneratedAudioBlob(masterBlob);

      // Re-assemble video
      setIsReassemblingVideo(true);
      updateStep(5, 'in-progress', 'Remontando vídeo final com novo áudio sincronizado...');
      setAssemblyProgress(0);
      const assembled = await assembleDubbedVideo(
        recording.blob || recording.url,
        masterBlob,
        {
          exactVideoDuration,
          masterAudioBlob: masterBlob,
          speechOffset: config.speechOffset,
          onProgress: (pct) => setAssemblyProgress(pct),
        }
      );
      setDubbedVideoResult(assembled);
      updateStep(5, 'completed', `Vídeo dublado atualizado! (${assembled.duration}s 100% preservados)`);

      const newRec: VideoRecording = {
        id: `dubbed-${Date.now()}`,
        url: assembled.url,
        blob: assembled.blob,
        duration: assembled.duration,
        timestamp: Date.now(),
        thumbnailUrl: recording.thumbnailUrl,
        sizeBytes: assembled.blob.size,
        filterName: `${recording.filterName || 'Take'} (Doblado ES)`,
      };
      onDubbingComplete?.(newRec);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao regerar áudio.');
      updateStep(4, 'error', err?.message);
    } finally {
      setIsRegeneratingTTS(false);
      setIsReassemblingVideo(false);
    }
  };

  const handleDownloadDubbedVideo = () => {
    if (!dubbedVideoResult) return;
    const isMp4 = dubbedVideoResult.blob.type.includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = dubbedVideoResult.url;
    a.download = `midicam-espanol-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      id="ai-dubbing-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in select-none text-white overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-white/20 rounded-2xl p-5 md:p-6 shadow-2xl flex flex-col gap-5 max-h-[92vh] overflow-y-auto my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-black flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-extrabold tracking-tight">
                  Dublagem & Tradução IA para Espanhol
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                  OpenAI Client-Side
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Transforme seu criativo gravado em um anúncio dublado em espanhol latino neutro
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                showConfigPanel || !config.apiKey
                  ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300'
              }`}
              title="Configurações de Voz & API Key"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Configuration Panel (Collapsible or Prominent if missing API key) */}
        {(showConfigPanel || !config.apiKey) && (
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-cyan-500/30 flex flex-col gap-3 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                <Key className="w-4 h-4 text-cyan-400" />
                <span>Configurações das APIs da OpenAI</span>
              </div>
              <span className="text-[10px] text-zinc-400">Salvo com segurança no seu navegador</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* API Key */}
              <div className="sm:col-span-2 md:col-span-4 flex flex-col gap-1.5">
                <label className="text-zinc-300 font-semibold flex items-center justify-between">
                  <span>OpenAI API Key (sk-...)</span>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{showApiKey ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="flex-1 bg-black/70 border border-white/20 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 transition"
                  />
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition cursor-pointer active:scale-95 shrink-0"
                  >
                    Salvar Chave
                  </button>
                </div>
              </div>

              {/* Voice Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 font-semibold flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Voz OpenAI TTS</span>
                </label>
                <select
                  value={config.voice}
                  onChange={(e) => handleVoiceChange(e.target.value as any)}
                  className="bg-black/70 border border-white/20 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  <option value="onyx">Onyx (Masculina, Firme)</option>
                  <option value="echo">Echo (Masculina, Dinâmica)</option>
                  <option value="alloy">Alloy (Neutra, Equilibrada)</option>
                  <option value="fable">Fable (Expressiva)</option>
                  <option value="shimmer">Shimmer (Feminina, Clara)</option>
                  <option value="nova">Nova (Feminina, Enérgica)</option>
                </select>
              </div>

              {/* TTS Model */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Modelo (TTS)</span>
                </label>
                <select
                  value={config.model}
                  onChange={(e) => handleModelChange(e.target.value as any)}
                  className="bg-black/70 border border-white/20 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  <option value="tts-1-hd">tts-1-hd (Alta Fidelidade)</option>
                  <option value="tts-1">tts-1 (Rápido e Leve)</option>
                </select>
              </div>

              {/* Translation Model Info */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 font-semibold flex items-center gap-1">
                  <Languages className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Tradução LATAM</span>
                </label>
                <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-zinc-400 text-xs flex items-center justify-between">
                  <span className="font-mono">gpt-4o-mini</span>
                  <span className="text-[10px] text-emerald-400 font-semibold">Persuasivo</span>
                </div>
              </div>

              {/* Speech Speed & Cadence Control */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Velocidade de Fala</span>
                  </span>
                  <span className="text-[10px] font-mono text-cyan-300 font-bold">
                    {config.speedMode === 'auto' ? 'Auto Sincronizado' : `${config.customSpeed ?? 1.0}x`}
                  </span>
                </label>
                <select
                  value={config.speedMode === 'auto' ? 'auto' : String(config.customSpeed ?? 1.0)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'auto') {
                      handleSpeedModeChange('auto');
                    } else {
                      handleSpeedModeChange('custom', parseFloat(val));
                    }
                  }}
                  className="bg-black/70 border border-white/20 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  <option value="auto">Auto (Calibrar com o Vídeo)</option>
                  <option value="0.9">0.9x (Mais Pausado)</option>
                  <option value="1.0">1.0x (Velocidade Normal)</option>
                  <option value="1.1">1.1x (Rápido / Dinâmico)</option>
                  <option value="1.2">1.2x (Enérgico)</option>
                  <option value="1.3">1.3x (Acelerado)</option>
                </select>
              </div>

              {/* Start Alignment / Offset */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ajuste de Início</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-300 font-bold">
                    {(config.speechOffset ?? 0) > 0 ? `+${config.speechOffset}s` : `${config.speechOffset ?? 0}s`}
                  </span>
                </label>
                <select
                  value={String(config.speechOffset ?? 0)}
                  onChange={(e) => handleSpeechOffsetChange(parseFloat(e.target.value))}
                  className="bg-black/70 border border-white/20 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  <option value="-0.4">-0.4s (Adiantar fala)</option>
                  <option value="-0.2">-0.2s (Adiantar fala)</option>
                  <option value="0">0.0s (Sincronia Automática Whisper)</option>
                  <option value="0.2">+0.2s (Atrasar fala)</option>
                  <option value="0.4">+0.4s (Atrasar fala)</option>
                </select>
              </div>
            </div>

            {/* Replacement Banner */}
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Substituição Pura:</strong> O áudio original em português é 100% mutado e removido do arquivo final, mantendo apenas a voz em espanhol ajustada ao ritmo do vídeo.
              </span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block text-rose-300 font-bold mb-0.5">Aviso de Operação:</strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Stepper / Processing Progress */}
        <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-zinc-900/60 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Fluxo Automatizado de Dublagem
            </span>
            {isProcessing && (
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processando Criativo...</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {stepStatuses.map((step) => {
              const isDone = step.status === 'completed';
              const isInProg = step.status === 'in-progress';
              const isErr = step.status === 'error';

              return (
                <div
                  key={step.step}
                  className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all ${
                    isDone
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : isInProg
                      ? 'bg-cyan-950/50 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                      : isErr
                      ? 'bg-rose-950/50 border-rose-500 text-rose-300'
                      : 'bg-zinc-900/40 border-white/5 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                    <span>Etapa {step.step}</span>
                    {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    {isInProg && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />}
                    {isErr && <AlertCircle className="w-3.5 h-3.5 text-rose-400" />}
                  </div>
                  <span className="text-[11px] font-semibold leading-tight line-clamp-2">
                    {step.title}
                  </span>
                  {isInProg && step.step === 5 && assemblyProgress > 0 && (
                    <div className="w-full bg-black/60 rounded-full h-1.5 overflow-hidden mt-1">
                      <div
                        className="bg-cyan-400 h-full transition-all duration-150"
                        style={{ width: `${assemblyProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action trigger button */}
          {!dubbedVideoResult && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                id="btn-trigger-dubbing-process"
                disabled={isProcessing}
                onClick={handleStartDubbingPipeline}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 disabled:opacity-50 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/20 active:scale-95 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando Passo a Passo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 stroke-[2.5]" />
                    <span>Processar Criativo para Espanhol</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Copy Comparison & Adjustment Area with Phrase/Pause Synchronization */}
        {(transcribedTextPt || translatedTextEs || speechSegments.length > 0) && (
          <div className="flex flex-col gap-3 bg-zinc-900/80 p-4 rounded-xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.08)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-white">Sincronização de Falas e Pausas</span>
                {speechSegments.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-[11px] font-bold text-cyan-300">
                    {speechSegments.length} Frases • {Math.max(0, speechSegments.length - 1)} Pausa(s) Interna(s)
                  </span>
                )}
              </div>

              {/* Toggle view: Segments vs Full */}
              <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setScriptViewTab('segments')}
                  className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    scriptViewTab === 'segments'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>Por Frases & Pausas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScriptViewTab('full')}
                  className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    scriptViewTab === 'full'
                      ? 'bg-cyan-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Texto Completo</span>
                </button>
              </div>
            </div>

            {scriptViewTab === 'segments' && speechSegments.length > 0 ? (
              <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
                {speechSegments.map((seg, idx) => {
                  const nextSeg = speechSegments[idx + 1];
                  const pauseAfter = nextSeg ? Math.max(0, nextSeg.start - seg.end) : 0;

                  return (
                    <React.Fragment key={seg.id}>
                      {/* Segment Card */}
                      <div className="flex flex-col gap-2 p-3 rounded-lg bg-black/60 border border-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold text-[10px]">
                              Frase #{idx + 1}
                            </span>
                            <span className="text-[11px] font-mono text-cyan-300 flex items-center gap-1">
                              <Timer className="w-3 h-3 text-cyan-400" />
                              <span>
                                {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s ({seg.duration.toFixed(1)}s)
                              </span>
                            </span>
                          </div>

                          {idx === 0 && seg.start >= 0.5 && (
                            <span className="text-[10px] text-amber-400/90 font-mono bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20">
                              Pausa inicial de {seg.start.toFixed(1)}s respeitada
                            </span>
                          )}
                        </div>

                        {/* Portuguese original phrase */}
                        <div className="text-[11px] text-zinc-400 italic bg-zinc-950/60 p-2 rounded border border-white/5">
                          <span className="text-zinc-400 font-semibold not-italic text-[10px] uppercase block mb-0.5">
                            Original (PT):
                          </span>
                          "{seg.originalText}"
                        </div>

                        {/* Spanish editable phrase */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-cyan-400 uppercase">
                            Copy Espanhol (adaptada ao tempo de {seg.duration.toFixed(1)}s):
                          </label>
                          <input
                            type="text"
                            value={seg.translatedText || ''}
                            onChange={(e) => handleSegmentTextChange(seg.id, e.target.value)}
                            placeholder="Frase traduzida..."
                            className="w-full bg-black/80 border border-cyan-500/40 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-cyan-400 font-sans"
                          />
                        </div>
                      </div>

                      {/* Natural silence pause indicator between phrases */}
                      {pauseAfter >= 0.35 && (
                        <div className="flex items-center justify-center gap-2 py-1 px-3 rounded-md bg-zinc-950/80 border border-dashed border-amber-500/30 text-amber-300 text-[11px] font-mono mx-auto">
                          <Pause className="w-3 h-3 text-amber-400" />
                          <span>
                            Pausa natural de silêncio de {pauseAfter.toFixed(1)}s preservada (nenhum áudio toca aqui)
                          </span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original Text (PT) */}
                <div className="flex flex-col gap-2 bg-zinc-950/60 p-3 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-amber-400" />
                      <span>Texto Original Transcrito (Português)</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">Whisper-1</span>
                  </div>
                  <textarea
                    rows={4}
                    value={transcribedTextPt}
                    onChange={(e) => setTranscribedTextPt(e.target.value)}
                    placeholder="Aguardando transcrição do áudio gravado..."
                    className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-zinc-200 text-xs leading-relaxed focus:outline-none focus:border-amber-400/50 resize-none font-sans"
                  />
                </div>

                {/* Translated Copy (ES) */}
                <div className="flex flex-col gap-2 bg-zinc-950/60 p-3 rounded-xl border border-cyan-500/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Copy Traduzida Persuasiva (Espanhol Latino)</span>
                    </span>
                    <span className="text-[10px] text-cyan-400/80 font-mono">GPT-4o-mini</span>
                  </div>
                  <textarea
                    rows={4}
                    value={translatedTextEs}
                    onChange={(e) => handleFullTextChange(e.target.value)}
                    placeholder="Tradução em espanhol..."
                    className="w-full bg-black/60 border border-cyan-400/40 rounded-lg p-2.5 text-white text-xs leading-relaxed focus:outline-none focus:border-cyan-400 resize-none font-sans"
                  />
                </div>
              </div>
            )}

            {/* Bottom action bar for regeneration */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/10">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Edit3 className="w-3 h-3 text-cyan-400" />
                <span>Você pode ajustar o texto das frases e clicar para regerar áudio mantendo as pausas sincronizadas</span>
              </span>
              <button
                type="button"
                id="btn-regenerate-dubbed-audio"
                onClick={handleRegenerateTTS}
                disabled={isRegeneratingTTS || isReassemblingVideo || isProcessing}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition shadow cursor-pointer active:scale-95"
              >
                {isRegeneratingTTS || isReassemblingVideo ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Regerando com Pausas...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Regerar Áudio Sincronizado</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Preview Player & Download Section */}
        {dubbedVideoResult && (
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-zinc-900 border border-emerald-500/40 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-300">
                  Vídeo Dublado Pronto para Download!
                </span>
              </div>

              {/* View Switcher */}
              <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('dubbed')}
                  className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                    activeTab === 'dubbed'
                      ? 'bg-emerald-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Dublado (ES)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('original')}
                  className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${
                    activeTab === 'original'
                      ? 'bg-amber-400 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Original (PT)
                </button>
              </div>
            </div>

            {/* Sync & Audio Replacement Status Badges */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vídeo: {dubbedVideoResult.duration}s (100% Preservado)</span>
              </span>
              <span className="px-2.5 py-1 rounded-md bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 font-mono flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>Velocidade da Fala: {appliedSpeechSpeed.toFixed(2)}x (Natural)</span>
              </span>
              {transcriptionInfo && (
                <span className="px-2.5 py-1 rounded-md bg-amber-950/70 border border-amber-500/40 text-amber-300 font-mono flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pausa Inicial: fala aos {transcriptionInfo.speechStartTime.toFixed(1)}s</span>
                </span>
              )}
              {speechSegments.length > 1 && (
                <span className="px-2.5 py-1 rounded-md bg-purple-950/70 border border-purple-500/40 text-purple-300 font-mono flex items-center gap-1.5">
                  <Pause className="w-3.5 h-3.5 text-purple-400" />
                  <span>{speechSegments.length - 1} Pausa(s) Interna(s) Respeitadas</span>
                </span>
              )}
            </div>

            {/* Video Player */}
            <div className="relative w-full aspect-video max-h-[38vh] bg-black rounded-xl overflow-hidden border border-white/15 flex items-center justify-center shadow-lg">
              <video
                key={activeTab === 'dubbed' ? dubbedVideoResult.url : recording.url}
                src={activeTab === 'dubbed' ? dubbedVideoResult.url : recording.url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            {/* Download & Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <span className="font-mono text-zinc-300">
                  Duração: {dubbedVideoResult.duration}s
                </span>
                <span>•</span>
                <span className="font-mono text-zinc-300">
                  Tamanho: {(dubbedVideoResult.blob.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-download-dubbed-video"
                  onClick={handleDownloadDubbedVideo}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-black font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Baixar Vídeo Dublado (.mp4/.webm)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
