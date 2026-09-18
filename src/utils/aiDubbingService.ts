// Client-side OpenAI translation, transcription and TTS Dubbing Service

export interface DubbingStepStatus {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  message?: string;
}

export interface DubbingConfig {
  apiKey: string;
  voice: 'onyx' | 'echo' | 'alloy' | 'fable' | 'shimmer' | 'nova';
  model: 'tts-1' | 'tts-1-hd';
  speedMode: 'auto' | 'custom';
  customSpeed: number; // 0.85 to 1.3
  speechOffset: number; // fine-tune offset in seconds (-1.0 to 1.0)
}

export interface VoiceActivityAnalysis {
  speechStartTime: number; // in seconds (e.g. 2.4s)
  speechEndTime: number; // in seconds (e.g. 9.5s)
  speechDuration: number; // in seconds (e.g. 7.1s)
  totalDuration: number; // total duration of audio in seconds
  hasLeadingPause: boolean;
}

export interface AudioExtractionResult {
  audioBlob: Blob; // WAV mono 16kHz blob for Whisper
  totalDuration: number; // exact audio length in seconds
  vad: VoiceActivityAnalysis;
}

export interface SpeechSegment {
  id: number;
  start: number; // in seconds in video timeline (e.g. 2.4s)
  end: number;   // in seconds in video timeline (e.g. 6.8s)
  duration: number; // in seconds (end - start)
  originalText: string;
  translatedText?: string;
  audioBlob?: Blob;
  audioDuration?: number;
  appliedSpeed?: number;
}

export interface TranscriptionResult {
  text: string;
  duration: number; // total duration of audio in seconds
  speechStartTime: number; // in seconds (e.g. 1.2s)
  speechEndTime: number; // in seconds (e.g. 9.5s)
  speechDuration: number; // in seconds (e.g. 8.3s)
  wordCount: number;
  segments: Array<{ start: number; end: number; text: string }>;
  speechSegments?: SpeechSegment[];
  vad?: VoiceActivityAnalysis;
}

const STORAGE_KEY = 'midicam_openai_config';

export function getStoredDubbingConfig(): DubbingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey || '',
        voice: parsed.voice || 'onyx',
        model: parsed.model || 'tts-1-hd',
        speedMode: parsed.speedMode || 'auto',
        customSpeed: typeof parsed.customSpeed === 'number' ? parsed.customSpeed : 1.0,
        speechOffset: typeof parsed.speechOffset === 'number' ? parsed.speechOffset : 0,
      };
    }
  } catch (err) {
    console.warn('Error reading stored OpenAI config:', err);
  }
  return {
    apiKey: '',
    voice: 'onyx',
    model: 'tts-1-hd',
    speedMode: 'auto',
    customSpeed: 1.0,
    speechOffset: 0,
  };
}

export function saveStoredDubbingConfig(config: DubbingConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Error saving OpenAI config:', err);
  }
}

/**
 * High-precision Voice Activity Detection (VAD) analyzing the raw PCM audio samples.
 * Accurately detects when the speaker begins talking after starting the recording,
 * preserving natural initial pauses and silences.
 */
export function detectVoiceActivity(audioBuffer: AudioBuffer): VoiceActivityAnalysis {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const totalDuration = audioBuffer.duration;

  if (!channelData || channelData.length === 0 || totalDuration <= 0.2) {
    return {
      speechStartTime: 0,
      speechEndTime: totalDuration,
      speechDuration: totalDuration,
      totalDuration,
      hasLeadingPause: false,
    };
  }

  // 30ms analysis frames
  const frameDuration = 0.03;
  const frameSize = Math.max(1, Math.floor(sampleRate * frameDuration));
  const frameCount = Math.floor(channelData.length / frameSize);

  if (frameCount < 5) {
    return {
      speechStartTime: 0,
      speechEndTime: totalDuration,
      speechDuration: totalDuration,
      totalDuration,
      hasLeadingPause: false,
    };
  }

  const rmsList = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const startIdx = f * frameSize;
    let sumSquares = 0;
    for (let s = 0; s < frameSize; s++) {
      const val = channelData[startIdx + s];
      sumSquares += val * val;
    }
    rmsList[f] = Math.sqrt(sumSquares / frameSize);
  }

  // Baseline ambient noise (15th percentile)
  const sorted = Array.from(rmsList).sort((a, b) => a - b);
  const noiseFloor = Math.max(0.0005, sorted[Math.floor(sorted.length * 0.15)] || 0.001);
  const peakRms = Math.max(noiseFloor * 2, sorted[Math.floor(sorted.length * 0.95)] || 0.02);

  // Dynamic voice threshold
  const voiceThreshold = Math.max(0.01, noiseFloor * 2.8, (noiseFloor + peakRms) * 0.18);

  // Scan forward for speech start (at least 3 consecutive frames = 90ms)
  let startFrame = 0;
  let consecutiveAbove = 0;
  let speechFound = false;

  for (let f = 0; f < frameCount; f++) {
    if (rmsList[f] >= voiceThreshold) {
      consecutiveAbove++;
      if (consecutiveAbove >= 3) {
        startFrame = Math.max(0, f - 3);
        speechFound = true;
        break;
      }
    } else {
      consecutiveAbove = 0;
    }
  }

  // Scan backwards for speech end
  let endFrame = frameCount - 1;
  consecutiveAbove = 0;
  for (let f = frameCount - 1; f >= 0; f--) {
    if (rmsList[f] >= voiceThreshold) {
      consecutiveAbove++;
      if (consecutiveAbove >= 3) {
        endFrame = Math.min(frameCount - 1, f + 3);
        break;
      }
    } else {
      consecutiveAbove = 0;
    }
  }

  const speechStartTime = speechFound ? Number((startFrame * frameDuration).toFixed(2)) : 0;
  const speechEndTime = speechFound
    ? Number(Math.min(totalDuration, (endFrame + 1) * frameDuration).toFixed(2))
    : totalDuration;
  const speechDuration = Math.max(0.5, speechEndTime - speechStartTime);
  const hasLeadingPause = speechStartTime >= 0.5;

  return {
    speechStartTime,
    speechEndTime,
    speechDuration,
    totalDuration,
    hasLeadingPause,
  };
}

/**
 * Obtains the exact true video duration from the recorded video element.
 */
export async function getVideoDuration(videoBlobOrUrl: Blob | string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const url = typeof videoBlobOrUrl === 'string' ? videoBlobOrUrl : URL.createObjectURL(videoBlobOrUrl);
    video.src = url;

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('durationchange', onMeta);
      video.removeEventListener('error', onError);
      if (typeof videoBlobOrUrl !== 'string') {
        URL.revokeObjectURL(url);
      }
    };

    const onMeta = () => {
      const dur = video.duration;
      if (isFinite(dur) && dur > 0) {
        cleanup();
        resolve(dur);
      }
    };

    const onError = () => {
      cleanup();
      resolve(0);
    };

    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('durationchange', onMeta);
    video.addEventListener('error', onError);

    // Timeout safety in case metadata event already fired or is delayed
    setTimeout(() => {
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        const d = video.duration;
        cleanup();
        resolve(d);
      } else {
        cleanup();
        resolve(0);
      }
    }, 1500);
  });
}

/**
 * Extracts audio from a video blob, analyzes exact video duration and Voice Activity (VAD),
 * and produces a 16kHz Mono WAV ready for OpenAI Whisper.
 */
export async function extractAudioFromVideoBlob(videoBlob: Blob): Promise<AudioExtractionResult> {
  const trueDuration = await getVideoDuration(videoBlob);
  const arrayBuffer = await videoBlob.arrayBuffer();
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioContextClass();
  
  let audioBuffer: AudioBuffer | null = null;
  try {
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeErr) {
    console.warn('Direct decodeAudioData failed, using video blob directly for Whisper:', decodeErr);
  } finally {
    await tempCtx.close().catch(() => {});
  }

  if (!audioBuffer) {
    // Whisper API accepts webm and mp4 videos directly
    const safeDuration = trueDuration > 0 ? trueDuration : 15;
    return {
      audioBlob: videoBlob,
      totalDuration: safeDuration,
      vad: {
        speechStartTime: 0,
        speechEndTime: safeDuration,
        speechDuration: safeDuration,
        totalDuration: safeDuration,
        hasLeadingPause: false,
      },
    };
  }

  // Run acoustic Voice Activity Detection
  const vad = detectVoiceActivity(audioBuffer);
  const totalDuration = trueDuration > 0 ? trueDuration : audioBuffer.duration;

  // Resample to 16kHz Mono WAV for Whisper
  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(totalDuration * targetSampleRate), targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);

  return {
    audioBlob: wavBlob,
    totalDuration,
    vad,
  };
}

/**
 * Encode an AudioBuffer into standard RIFF PCM 16-bit WAV
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels || 1;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // fmt sub-chunk
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // subchunk1size (16 for PCM)
  setUint16(1); // audio format (1 = PCM)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample

  // data sub-chunk
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // chunk length

  // Write PCM samples
  for (let c = 0; c < numOfChan; c++) {
    channels.push(buffer.getChannelData(c));
  }

  while (pos < length && offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], { type: 'audio/wav' });
}

/**
 * Transcribe the entire recorded audio at once using OpenAI Whisper API (/v1/audio/transcriptions)
 * and return the full text as a single continuous string.
 */
export async function transcribeAudioWhisper(
  audioBlob: Blob,
  apiKey: string,
  vadHint?: VoiceActivityAnalysis
): Promise<TranscriptionResult> {
  const formData = new FormData();
  const fileExt = audioBlob.type.includes('wav') ? 'wav' : 'webm';
  const file = new File([audioBlob], `recording.${fileExt}`, { type: audioBlob.type });

  formData.append('file', file);
  formData.append('model', 'whisper-1');
  formData.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(`Erro na transcrição Whisper (${res.status}): ${errorDetail}`);
  }

  const data = await res.json();
  const text = (data.text || '').trim();
  const duration = Number(data.duration) || vadHint?.totalDuration || 0;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const result: TranscriptionResult = {
    text,
    duration,
    speechStartTime: vadHint?.speechStartTime ?? 0,
    speechEndTime: duration > 0 ? duration : (vadHint?.speechEndTime ?? 0),
    speechDuration: duration > 0 ? duration : (vadHint?.speechDuration ?? 0),
    wordCount,
    segments: [{ start: 0, end: duration > 0 ? duration : 10, text }],
    vad: vadHint,
  };

  return result;
}

/**
 * Extracts Whisper segments with { start, end, text, duration } for Time-aligned Dubbing.
 * Preserves each segment boundary and all natural pauses/silences between them.
 */
export function extractWhisperSegments(
  rawSegments: Array<{ start: number; end: number; text: string }>,
  fullText: string,
  totalDuration: number
): SpeechSegment[] {
  if (Array.isArray(rawSegments) && rawSegments.length > 0) {
    const valid = rawSegments
      .filter((s) => s && s.text && s.text.trim().length > 0)
      .map((s, idx) => {
        const start = Math.max(0, Number(Number(s.start).toFixed(2)));
        const end = Math.max(start + 0.1, Number(Number(s.end).toFixed(2)));
        const duration = Number((end - start).toFixed(2));
        return {
          id: idx,
          start,
          end,
          duration,
          originalText: s.text.trim(),
        };
      });

    if (valid.length > 0) {
      return valid;
    }
  }

  // Fallback: If Whisper didn't return segments (e.g. single short sentence)
  const cleanedText = fullText.trim();
  if (!cleanedText) return [];

  const sentences = cleanedText
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length <= 1) {
    return [
      {
        id: 0,
        start: 0,
        end: totalDuration,
        duration: Math.max(0.5, totalDuration),
        originalText: cleanedText,
      },
    ];
  }

  const durPerSentence = Number((totalDuration / sentences.length).toFixed(2));
  return sentences.map((sent, i) => {
    const start = Number((i * durPerSentence).toFixed(2));
    const end = Number(((i + 1) * durPerSentence).toFixed(2));
    return {
      id: i,
      start,
      end,
      duration: Number((end - start).toFixed(2)),
      originalText: sent,
    };
  });
}

// Alias for backwards compatibility
export const processAndGroupWhisperSegments = extractWhisperSegments;

/**
 * Translates segments with GPT-4o-mini under strict time constraint (duration = end - start).
 * The translated Spanish text must fit within that segment's exact duration in natural speech.
 */
export async function translateSegmentsGPT(
  segments: SpeechSegment[],
  apiKey: string,
  totalVideoDuration?: number
): Promise<SpeechSegment[]> {
  if (segments.length === 0) return [];

  const payload = segments.map((s) => ({
    id: s.id,
    start: Number(s.start.toFixed(2)),
    end: Number(s.end.toFixed(2)),
    duration: Number((s.end - s.start).toFixed(2)),
    text_pt: s.originalText,
  }));

  const systemPrompt =
`Você é um especialista em dublagem alinhada por tempo (Time-aligned Dubbing) e copywriting persuasivo para criativos de tráfego pago (TikTok, Reels, Shorts).
O Whisper transcreveu o vídeo em ${segments.length} segmentos com timestamps exatos: { start, end, duration }.

RESTRIÇÃO MANDATÓRIA DE SINCRONIA:
1. Traduza cada frase do português para o espanhol latino neutro, mantendo tom persuasivo, ganchos e retenção.
2. CRÍTICO: Cada frase será gravada INDIVIDUALMENTE por TTS e DEVE caber com perfeição dentro do tempo 'duration' do segmento com dicção humana natural (~2.2 a 2.5 palavras por segundo em espanhol):
   - Se duration <= 1.5s: Máximo de 3 a 4 palavras.
   - Se duration <= 2.5s: Máximo de 5 a 6 palavras.
   - Se duration <= 4.0s: Máximo de 8 a 10 palavras.
   - NUNCA crie frases longas que excedam a 'duration' do segmento. Ajuste o vocabulário para ser conciso, direto e potente.
3. Respeite os ${segments.length} segmentos e mantenha o mesmo "id".
4. Retorne EXCLUSIVAMENTE um objeto JSON com a chave "translations":
{
  "translations": [
    { "id": 0, "es": "frase em espanhol concisa" }
  ]
}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.35,
      }),
    });

    if (!res.ok) {
      const errDetail = await res.text();
      throw new Error(`Erro na tradução por segmentos (${res.status}): ${errDetail}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);
    const transList: Array<{ id: number; es: string }> = Array.isArray(parsed.translations)
      ? parsed.translations
      : Array.isArray(parsed)
      ? parsed
      : [];

    const translatedList: SpeechSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const match = transList.find((t) => t.id === seg.id);
      let es = match?.es ? String(match.es).trim() : '';

      // If missing from batch, translate individually
      if (!es) {
        try {
          es = await translateSingleSegmentGPT(seg.originalText, seg.duration, apiKey);
          await new Promise((r) => setTimeout(r, 60));
        } catch {
          es = seg.originalText;
        }
      }

      translatedList.push({
        ...seg,
        translatedText: es,
      });
    }

    return translatedList;
  } catch (err) {
    console.warn('Fallback: translating segments sequentially with rate limit protection:', err);
    const fallbackResults: SpeechSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      try {
        const es = await translateSingleSegmentGPT(seg.originalText, seg.duration, apiKey);
        fallbackResults.push({ ...seg, translatedText: es });
      } catch {
        fallbackResults.push({ ...seg, translatedText: seg.originalText });
      }
      if (i < segments.length - 1) {
        await new Promise((r) => setTimeout(r, 80));
      }
    }
    return fallbackResults;
  }
}

/**
 * Translates a single segment with strict duration constraint.
 */
export async function translateSingleSegmentGPT(
  text: string,
  duration: number,
  apiKey: string
): Promise<string> {
  const maxWords = Math.max(2, Math.round(duration * 2.4));
  const prompt =
`Você é um especialista em dublagem para tráfego pago.
Traduza a frase abaixo do português para o espanhol latino neutro persuasivo.
RESTRIÇÃO CRÍTICA DE TEMPO: A fala DEVE caber em ${duration.toFixed(1)} segundos (máximo aproximado de ${maxWords} palavras).
Texto original: "${text}"
Retorne APENAS o texto traduzido em espanhol, sem aspas ou notas.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
    }),
  });

  if (!res.ok) {
    throw new Error(`Erro ao traduzir frase: ${res.statusText}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim() || text;
}

/**
 * Generates TTS for a single segment.
 * If the generated audio exceeds the segment's targetDuration (duration = end - start),
 * applies a slight pitch-preserving speed adjustment (up to 1.15x) so it fits into the block.
 */
export async function generateSegmentTTS(
  spanishText: string,
  targetDuration: number,
  apiKey: string,
  voice: DubbingConfig['voice'] = 'onyx',
  model: DubbingConfig['model'] = 'tts-1-hd',
  forcedSpeed?: number
): Promise<{ blob: Blob; duration: number; speed: number }> {
  const text = spanishText.trim();
  if (!text) {
    throw new Error('Texto vazio para geração TTS.');
  }

  // If user configured a forced speed, use it directly
  if (forcedSpeed && forcedSpeed !== 1.0) {
    return await generateSpeechTTS(text, apiKey, voice, model, forcedSpeed);
  }

  // 1. Initial pass at natural 1.0x human speaking rate
  const initialPass = await generateSpeechTTS(text, apiKey, voice, model, 1.0);

  // 2. Check if the audio generated exceeds the segment's target duration
  if (targetDuration > 0.1 && initialPass.duration > targetDuration) {
    const overrunRatio = initialPass.duration / targetDuration;
    // If it overruns by more than 3%
    if (overrunRatio > 1.03) {
      // User directive: "Se o áudio gerado ultrapassar o timestamp end do segmento,
      // faça um ajuste leve de pitch-preserving speed (até 1.15x) para caber no bloco."
      const adjustedSpeed = Math.min(1.15, Number(overrunRatio.toFixed(2)));
      try {
        const calibratedPass = await generateSpeechTTS(text, apiKey, voice, model, adjustedSpeed);
        return calibratedPass;
      } catch (calibErr) {
        console.warn('Fallback to 1.0x pass:', calibErr);
      }
    }
  }

  return initialPass;
}

/**
 * Generates Spanish Speech for each individual segment using OpenAI TTS.
 * Calls OpenAI TTS for each phrase and applies pitch-preserving speed up to 1.15x if needed.
 */
export async function generateMultiSegmentSpeechTTS(
  segments: SpeechSegment[],
  apiKey: string,
  voice: DubbingConfig['voice'] = 'onyx',
  model: DubbingConfig['model'] = 'tts-1-hd',
  totalVideoDuration: number = 15,
  forcedSpeed?: number
): Promise<{
  segments: SpeechSegment[];
  totalVoiceDuration: number;
  averageSpeed: number;
}> {
  const updatedSegments: SpeechSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const textToSpeak = (seg.translatedText || seg.originalText || '').trim();
    if (!textToSpeak) {
      updatedSegments.push(seg);
      continue;
    }

    const targetDuration = Number((seg.end - seg.start).toFixed(2));
    const { blob, duration, speed } = await generateSegmentTTS(
      textToSpeak,
      targetDuration,
      apiKey,
      voice,
      model,
      forcedSpeed
    );

    updatedSegments.push({
      ...seg,
      audioBlob: blob,
      audioDuration: duration,
      appliedSpeed: speed,
    });

    // Small delay between calls to avoid hitting rate limits
    if (i < segments.length - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const totalVoiceDuration = updatedSegments.reduce((sum, s) => sum + (s.audioDuration ?? 0), 0);
  const speeds = updatedSegments.map((s) => s.appliedSpeed ?? 1.0);
  const averageSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 1.0;

  return {
    segments: updatedSegments,
    totalVoiceDuration,
    averageSpeed,
  };
}

/**
 * Sincronização Global por Time-Stretching (Web Audio):
 * 1. Pega a duração exata do vídeo gravado: const targetDuration = videoBlobDuration;
 * 2. Decodifica o áudio MP3 recebido do OpenAI TTS: const decoded = await audioCtx.decodeAudioData(arrayBuffer);
 * 3. Calcula a proporção linear de tempo: const rate = decoded.duration / targetDuration;
 * 4. Cria um OfflineAudioContext com a duração exata do vídeo:
 *    const offlineCtx = new OfflineAudioContext(1, 44100 * targetDuration, 44100);
 *    const src = offlineCtx.createBufferSource();
 *    src.buffer = decoded;
 *    src.playbackRate.value = rate; // estica/comprime o áudio todo suavemente para casar com o vídeo
 *    src.connect(offlineCtx.destination);
 *    src.start(0);
 *    const syncedBuffer = await offlineCtx.startRendering();
 * 5. Exporta esse syncedBuffer como áudio final sincronizado em WAV.
 */
export async function syncAudioByTimeStretching(
  audioBlob: Blob,
  targetDuration: number
): Promise<{ syncedBuffer: AudioBuffer; wavBlob: Blob; duration: number; rate: number }> {
  const safeTargetDuration = Math.max(0.5, targetDuration);
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioCtxClass();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  await tempCtx.close().catch(() => {});

  // Proporção linear de tempo: decoded.duration / targetDuration
  // Ex: se o áudio tem 12s e o vídeo tem 10s -> rate = 1.2 (reproduz a 1.2x para caber em 10s)
  // Ex: se o áudio tem 8s e o vídeo tem 10s -> rate = 0.8 (estica para 10s)
  const rate = decoded.duration > 0 && safeTargetDuration > 0
    ? decoded.duration / safeTargetDuration
    : 1.0;

  const sampleRate = 44100;
  const totalLength = Math.max(1, Math.round(sampleRate * safeTargetDuration));
  const numberOfChannels = Math.max(1, decoded.numberOfChannels || 1);

  const offlineCtx = new OfflineAudioContext(numberOfChannels, totalLength, sampleRate);
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = rate;
  src.connect(offlineCtx.destination);
  src.start(0);

  const syncedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(syncedBuffer);

  return {
    syncedBuffer,
    wavBlob,
    duration: safeTargetDuration,
    rate,
  };
}

/**
 * Web Audio API com AudioBufferTimeline (Compatibilidade com pipelines anteriores se necessário)
 */
export async function buildAudioBufferTimeline(
  segments: SpeechSegment[],
  videoDuration: number
): Promise<{ finalBuffer: AudioBuffer; wavBlob: Blob; duration: number }> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx({ sampleRate: 44100 });
  const sampleRate = audioCtx.sampleRate;
  const safeVideoDuration = Math.max(0.5, videoDuration);
  const totalSamples = Math.ceil(sampleRate * safeVideoDuration);

  // 2. Buffer final vazio com a mesma duração do vídeo
  const finalBuffer = audioCtx.createBuffer(2, totalSamples, sampleRate);
  const leftChannel = finalBuffer.getChannelData(0);
  const rightChannel = finalBuffer.getChannelData(1);

  // 3. Posicionamento por Timestamp
  for (const seg of segments) {
    if (!seg.audioBlob) continue;

    try {
      const arrBuf = await seg.audioBlob.arrayBuffer();
      const segAudioBuffer = await audioCtx.decodeAudioData(arrBuf.slice(0));
      const startIndex = Math.floor(seg.start * sampleRate);
      const segLeft = segAudioBuffer.getChannelData(0);
      const segRight = segAudioBuffer.numberOfChannels > 1 ? segAudioBuffer.getChannelData(1) : segLeft;

      for (let i = 0; i < segAudioBuffer.length; i++) {
        const destIndex = startIndex + i;
        if (destIndex >= totalSamples) break;
        leftChannel[destIndex] = Math.max(-1, Math.min(1, leftChannel[destIndex] + segLeft[i]));
        rightChannel[destIndex] = Math.max(-1, Math.min(1, rightChannel[destIndex] + segRight[i]));
      }
    } catch (err) {
      console.warn(`Erro ao decodificar áudio do segmento ${seg.id}:`, err);
    }
  }

  await audioCtx.close().catch(() => {});

  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = finalBuffer;
  sourceNode.connect(offlineCtx.destination);
  sourceNode.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);

  return {
    finalBuffer: renderedBuffer,
    wavBlob,
    duration: safeVideoDuration,
  };
}

/**
 * Composes a full-length master audio track using buildAudioBufferTimeline.
 */
export async function composeMultiSegmentMasterTrack(
  segments: SpeechSegment[],
  exactVideoDuration: number,
  speechOffset: number = 0
): Promise<{ masterBlob: Blob; duration: number }> {
  const adjusted = speechOffset !== 0
    ? segments.map((s) => ({
        ...s,
        start: Math.max(0, s.start + speechOffset),
      }))
    : segments;

  const res = await buildAudioBufferTimeline(adjusted, exactVideoDuration);
  return {
    masterBlob: res.wavBlob,
    duration: res.duration,
  };
}

/**
 * Translate Copy from Portuguese to Persuasive Latin American Spanish using GPT-4o-mini
 * with the exact advertising copy prompt requested.
 */
export async function translateCopyGPT(
  originalPortugueseText: string,
  apiKey: string,
  availableTimeWindow?: number
): Promise<string> {
  const prompt = `Traduza esta copy para espanhol neutro de anúncios. Mantenha o tom persuasivo e use reticências (...) onde houver pausas naturais. Mantenha a mesma quantidade de palavras para não alterar o ritmo de leitura.

Texto original:
"${originalPortugueseText}"

Retorne APENAS a copy traduzida inteira em espanhol, sem aspas adicionais, introduções ou notas.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em tradução e copywriting persuasivo para anúncios em espanhol latino neutro.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(`Erro no GPT-4o-mini (${res.status}): ${errorDetail}`);
  }

  const data = await res.json();
  const translation = data.choices?.[0]?.message?.content?.trim();
  if (!translation) {
    throw new Error('Nenhuma tradução retornada pelo GPT-4o-mini.');
  }
  return translation;
}

/**
 * Generate Spanish Speech using OpenAI TTS API
 */
export async function generateSpeechTTS(
  spanishText: string,
  apiKey: string,
  voice: DubbingConfig['voice'] = 'onyx',
  model: DubbingConfig['model'] = 'tts-1-hd',
  speed: number = 1.0
): Promise<{ blob: Blob; duration: number; speed: number }> {
  const clampedSpeed = Math.min(2.0, Math.max(0.85, Number(speed.toFixed(2))));

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: model || 'tts-1-hd',
      voice: voice || 'onyx',
      input: spanishText,
      speed: clampedSpeed,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(`Erro no OpenAI TTS (${res.status}): ${errorDetail}`);
  }

  const audioBlob = await res.blob();

  // Measure audio buffer duration accurately using Web Audio API
  let duration = 0;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const tempCtx = new AudioCtx();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuf = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    duration = audioBuf.duration;
    await tempCtx.close().catch(() => {});
  } catch (measureErr) {
    console.warn('Could not measure audio duration:', measureErr);
  }

  return { blob: audioBlob, duration, speed: clampedSpeed };
}

/**
 * Generates Spanish Speech with natural human speaking rate (1.0x standard, like ElevenLabs).
 * CRITICAL DIRECTIVE: NEVER SLOW DOWN SPEECH BELOW 1.0x (slowing down makes voice sound artificial and sluggish).
 * Only if the speech would overrun the video duration do we gently accelerate to fit.
 */
export async function generateSynchronizedSpeechTTS(
  spanishText: string,
  apiKey: string,
  voice: DubbingConfig['voice'] = 'onyx',
  model: DubbingConfig['model'] = 'tts-1-hd',
  availableTimeWindow?: number,
  forcedSpeed?: number
): Promise<{ blob: Blob; duration: number; appliedSpeed: number }> {
  // If user explicitly configured a custom/manual speed, respect it
  if (forcedSpeed && forcedSpeed !== 1.0) {
    const res = await generateSpeechTTS(spanishText, apiKey, voice, model, forcedSpeed);
    return { blob: res.blob, duration: res.duration, appliedSpeed: res.speed };
  }

  // 1. Generate speech at natural 1.0x human speaking rate
  const naturalPass = await generateSpeechTTS(spanishText, apiKey, voice, model, 1.0);

  // If no time window provided or fits comfortably inside the available window, KEEP NATURAL 1.0x!
  if (!availableTimeWindow || availableTimeWindow <= 0.5) {
    return { blob: naturalPass.blob, duration: naturalPass.duration, appliedSpeed: 1.0 };
  }

  // If speech fits inside the video duration, NEVER slow down: 1.0x natural rate is ideal!
  if (naturalPass.duration <= availableTimeWindow) {
    return { blob: naturalPass.blob, duration: naturalPass.duration, appliedSpeed: 1.0 };
  }

  // Only if speech is longer than available video time, slightly accelerate so it finishes before video ends
  const requiredSpeed = Number((naturalPass.duration / Math.max(0.5, availableTimeWindow - 0.2)).toFixed(2));
  const fitSpeed = Math.min(1.25, Math.max(1.02, requiredSpeed));

  try {
    const acceleratedPass = await generateSpeechTTS(
      spanishText,
      apiKey,
      voice,
      model,
      fitSpeed
    );
    return {
      blob: acceleratedPass.blob,
      duration: acceleratedPass.duration,
      appliedSpeed: acceleratedPass.speed,
    };
  } catch (calibErr) {
    console.warn('Speed adaptation fallback to natural 1.0x pass:', calibErr);
    return { blob: naturalPass.blob, duration: naturalPass.duration, appliedSpeed: 1.0 };
  }
}

/**
 * Builds a master audio track with the exact total duration of the original video.
 * Bakes the initial silence (waiting before speaking) directly into the audio timeline,
 * ensuring the Spanish voice enters at the exact millisecond the speaker spoke.
 */
export async function composeMasterDubbedAudioTrack(
  spanishAudioBlob: Blob,
  exactVideoDuration: number,
  speechStartTime: number
): Promise<{ masterBlob: Blob; duration: number }> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioCtx();
  const arrayBuffer = await spanishAudioBlob.arrayBuffer();
  const spanishAudioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  await tempCtx.close().catch(() => {});

  const sampleRate = 44100;
  const totalDuration = Math.max(1, exactVideoDuration);
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  // Place Spanish voice at speechStartTime
  const safeStartTime = Math.max(0, Math.min(speechStartTime, Math.max(0, totalDuration - 0.2)));
  const source = offlineCtx.createBufferSource();
  source.buffer = spanishAudioBuffer;
  source.connect(offlineCtx.destination);
  source.start(safeStartTime);

  const rendered = await offlineCtx.startRendering();
  const masterWav = audioBufferToWavBlob(rendered);

  return {
    masterBlob: masterWav,
    duration: totalDuration,
  };
}

export interface AssembleDubbedVideoOptions {
  exactVideoDuration?: number; // Exact duration in seconds of original recording (MUST NOT BE SHORTENED)
  speechStartTime?: number;    // Detected start timestamp of speech in seconds
  speechOffset?: number;       // Manual fine-tune offset in seconds
  masterAudioBlob?: Blob;      // Pre-composed full length master audio track (with pauses baked in)
  segments?: SpeechSegment[];  // Multi-segment timestamp-aligned speech items
  onProgress?: (percent: number) => void;
}

/**
 * Client-side Audio Replacement & Video Assembly:
 * 1. NEVER shortens or modifies video length. Full original video is 100% preserved.
 * 2. Original microphone audio (Portuguese) is 100% discarded.
 * 3. Spanish voice tracks are positioned at the exact moments the speaker starts talking,
 *    respecting all initial and inner acoustic pauses.
 */
export async function assembleDubbedVideo(
  videoUrlOrBlob: string | Blob,
  spanishAudioBlob: Blob,
  options: AssembleDubbedVideoOptions = {}
): Promise<{ blob: Blob; url: string; duration: number }> {
  return new Promise(async (resolve, reject) => {
    let videoEl: HTMLVideoElement | null = null;
    let audioCtx: AudioContext | null = null;
    let animId: number | null = null;
    let completed = false;
    let videoSrc = '';

    const cleanup = () => {
      completed = true;
      if (animId) cancelAnimationFrame(animId);
      if (videoEl) {
        videoEl.pause();
        if (videoEl.parentElement) {
          videoEl.parentElement.removeChild(videoEl);
        }
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      if (videoSrc && typeof videoUrlOrBlob !== 'string') {
        URL.revokeObjectURL(videoSrc);
      }
    };

    try {
      // 1. Setup Video Element in DOM inside active viewport
      videoSrc = typeof videoUrlOrBlob === 'string' ? videoUrlOrBlob : URL.createObjectURL(videoUrlOrBlob);
      videoEl = document.createElement('video');
      videoEl.src = videoSrc;
      videoEl.muted = true; // Video element is muted so original Portuguese audio never leaks
      videoEl.crossOrigin = 'anonymous';
      videoEl.playsInline = true;
      (videoEl as any).webkitPlaysInline = true;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('webkit-playsinline', 'true');

      videoEl.style.position = 'fixed';
      videoEl.style.top = '0px';
      videoEl.style.left = '0px';
      videoEl.style.width = '160px';
      videoEl.style.height = '90px';
      videoEl.style.opacity = '0.001';
      videoEl.style.pointerEvents = 'none';
      videoEl.style.zIndex = '-99999';
      document.body.appendChild(videoEl);

      // Wait for video metadata and first frame
      await new Promise<void>((res) => {
        if (videoEl!.readyState >= 2) {
          res();
        } else {
          videoEl!.onloadeddata = () => res();
          videoEl!.onloadedmetadata = () => res();
          videoEl!.onerror = () => res();
        }
      });

      // Seek to frame 0
      videoEl.currentTime = 0;
      await new Promise<void>((res) => {
        const onSeek = () => {
          videoEl!.removeEventListener('seeked', onSeek);
          res();
        };
        videoEl!.addEventListener('seeked', onSeek);
        setTimeout(res, 200);
      });

      // Determine TRUE video duration (never truncate to 10s!)
      const trueVideoDuration = Math.max(
        1,
        options.exactVideoDuration && isFinite(options.exactVideoDuration) && options.exactVideoDuration > 0
          ? options.exactVideoDuration
          : videoEl.duration && isFinite(videoEl.duration)
          ? videoEl.duration
          : 15
      );

      const effectiveSpeechStart = Math.max(
        0,
        (options.speechStartTime ?? 0) + (options.speechOffset ?? 0)
      );

      // 2. Compose or use pre-composed master audio track
      let masterBlob: Blob;
      if (options.masterAudioBlob) {
        masterBlob = options.masterAudioBlob;
      } else if (options.segments && options.segments.length > 0) {
        const res = await composeMultiSegmentMasterTrack(
          options.segments,
          trueVideoDuration,
          options.speechOffset ?? 0
        );
        masterBlob = res.masterBlob;
      } else {
        const res = await composeMasterDubbedAudioTrack(
          spanishAudioBlob,
          trueVideoDuration,
          effectiveSpeechStart
        );
        masterBlob = res.masterBlob;
      }

      // 3. Initialize Web Audio API to feed MediaRecorder
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const masterArrayBuf = await masterBlob.arrayBuffer();
      const masterAudioBuffer = await audioCtx.decodeAudioData(masterArrayBuf.slice(0));

      const audioDestNode = audioCtx.createMediaStreamDestination();
      const masterSourceNode = audioCtx.createBufferSource();
      masterSourceNode.buffer = masterAudioBuffer;
      const ttsGain = audioCtx.createGain();
      ttsGain.gain.setValueAtTime(1.15, audioCtx.currentTime);
      masterSourceNode.connect(ttsGain);
      ttsGain.connect(audioDestNode);

      const width = videoEl.videoWidth || 1280;
      const height = videoEl.videoHeight || 720;

      // 4. Setup Canvas and MediaRecorder Stream
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Não foi possível obter contexto 2D do canvas');
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const canvasStream = canvas.captureStream(30);
      const videoTrack = canvasStream.getVideoTracks()[0];
      const audioTrack = audioDestNode.stream.getAudioTracks()[0];

      if (!videoTrack || !audioTrack) {
        throw new Error('Falha ao obter tracks de mídia para a montagem do vídeo');
      }

      const combinedStream = new MediaStream([videoTrack, audioTrack]);

      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      const mimeCandidates = isIOS
        ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

      let chosenMime = '';
      for (const m of mimeCandidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          chosenMime = m;
          break;
        }
      }

      const recorder = new MediaRecorder(combinedStream, {
        ...(chosenMime ? { mimeType: chosenMime } : {}),
        videoBitsPerSecond: 4000000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        cleanup();
        const finalBlob = new Blob(chunks, { type: chosenMime || 'video/webm' });
        const finalUrl = URL.createObjectURL(finalBlob);
        resolve({
          blob: finalBlob,
          url: finalUrl,
          duration: Math.round(trueVideoDuration),
        });
      };

      recorder.onerror = (err) => {
        cleanup();
        reject(err);
      };

      // 5. Start recorder, play video and master audio in absolute sync at frame 0
      videoEl.currentTime = 0;
      await new Promise<void>((readyRes) => {
        let started = false;
        const onPlaying = () => {
          if (!started) {
            started = true;
            videoEl!.removeEventListener('playing', onPlaying);
            readyRes();
          }
        };
        videoEl!.addEventListener('playing', onPlaying);
        videoEl!.play().catch((playErr) => {
          console.warn('Video element play() caught:', playErr);
          if (!started) {
            started = true;
            readyRes();
          }
        });
        setTimeout(() => {
          if (!started) {
            started = true;
            readyRes();
          }
        }, 600);
      });

      // Video playback is active: start master audio source and recorder simultaneously
      masterSourceNode.start(0);
      recorder.start(100);

      // 6. Video Frame Render Loop: preserves 100% of video frames without cutting
      const renderLoop = () => {
        if (completed) return;

        if (videoEl && videoEl.readyState >= 2) {
          ctx.drawImage(videoEl, 0, 0, width, height);
        }

        const curTime = videoEl ? videoEl.currentTime : 0;

        if (options.onProgress && trueVideoDuration > 0) {
          const pct = Math.min(99, Math.round((curTime / trueVideoDuration) * 100));
          options.onProgress(pct);
        }

        // Complete ONLY when the video finishes playing its true duration
        if (videoEl && (videoEl.ended || curTime >= trueVideoDuration - 0.03)) {
          completed = true;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        animId = requestAnimationFrame(renderLoop);
      };

      animId = requestAnimationFrame(renderLoop);

      // Safety timeout scaled generously to the true video duration
      setTimeout(() => {
        if (!completed && recorder.state === 'recording') {
          completed = true;
          recorder.stop();
        }
      }, (trueVideoDuration + 8) * 1000);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
