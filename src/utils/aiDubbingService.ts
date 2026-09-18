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
 * Extracts audio from a video blob, analyzes exact video duration and Voice Activity (VAD),
 * and produces a 16kHz Mono WAV ready for OpenAI Whisper.
 */
export async function extractAudioFromVideoBlob(videoBlob: Blob): Promise<AudioExtractionResult> {
  const arrayBuffer = await videoBlob.arrayBuffer();
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioContextClass();
  
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeErr) {
    await tempCtx.close();
    console.warn('Direct decodeAudioData failed, sending video blob slice for Whisper:', decodeErr);
    const sliceBlob = new Blob([videoBlob], { type: 'audio/webm' });
    return {
      audioBlob: sliceBlob,
      totalDuration: 10,
      vad: {
        speechStartTime: 0,
        speechEndTime: 10,
        speechDuration: 10,
        totalDuration: 10,
        hasLeadingPause: false,
      },
    };
  }
  await tempCtx.close();

  // Run acoustic Voice Activity Detection
  const vad = detectVoiceActivity(audioBuffer);

  // Resample to 16kHz Mono WAV for Whisper
  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);

  return {
    audioBlob: wavBlob,
    totalDuration: audioBuffer.duration,
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
 * Transcribe Audio in Portuguese using OpenAI Whisper API with segment timestamps
 * and acoustic VAD cross-verification.
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
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

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
  const segments = Array.isArray(data.segments) ? data.segments : [];

  let speechStartTime = vadHint?.speechStartTime ?? 0;
  let speechEndTime = vadHint?.speechEndTime ?? duration;

  // Cross-verify with Whisper segments if available
  if (segments.length > 0) {
    const validSegments = segments.filter((s: any) => s.text && s.text.trim().length > 0);
    if (validSegments.length > 0) {
      const whisperStart = Math.max(0, validSegments[0].start ?? 0);
      const whisperEnd = Math.max(whisperStart + 0.3, validSegments[validSegments.length - 1].end ?? duration);

      // If VAD detected an initial pause before speaking, preserve it
      if (vadHint && vadHint.speechStartTime >= 0.5) {
        speechStartTime = vadHint.speechStartTime;
      } else if (whisperStart > 0.3) {
        speechStartTime = whisperStart;
      }
      speechEndTime = Math.max(speechStartTime + 0.5, whisperEnd);
    }
  }

  const speechDuration = Math.max(0.5, speechEndTime - speechStartTime);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const result: TranscriptionResult = {
    text,
    duration,
    speechStartTime,
    speechEndTime,
    speechDuration,
    wordCount,
    segments,
    vad: vadHint,
  };

  return result;
}

/**
 * Groups and cleans Whisper segments into natural speaking blocks,
 * preserving genuine human pauses, breaths, and breaks (gap >= 0.45s).
 */
export function processAndGroupWhisperSegments(
  rawSegments: Array<{ start: number; end: number; text: string }>,
  fullText: string,
  totalDuration: number,
  vadHint?: VoiceActivityAnalysis
): SpeechSegment[] {
  const cleanedText = fullText.trim();
  const validRaw = (rawSegments || [])
    .filter((s) => s.text && s.text.trim().length > 0)
    .map((s, idx) => ({
      id: idx,
      start: Math.max(0, Number(Number(s.start).toFixed(2))),
      end: Math.max(0.1, Number(Number(s.end).toFixed(2))),
      text: s.text.trim(),
    }));

  // Fallback: If Whisper didn't return valid segments, split text by sentence punctuation
  if (validRaw.length === 0) {
    if (!cleanedText) return [];
    const sentences = cleanedText
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const speechStart = vadHint?.speechStartTime ?? 0;
    const speechEnd = vadHint?.speechEndTime ?? totalDuration;
    const speechDur = Math.max(1, speechEnd - speechStart);

    if (sentences.length <= 1) {
      return [
        {
          id: 0,
          start: speechStart,
          end: speechEnd,
          duration: speechDur,
          originalText: cleanedText,
        },
      ];
    }

    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
    let currentStart = speechStart;
    const pauseBetween = Math.min(0.8, Math.max(0.3, (speechDur * 0.15) / sentences.length));
    const effectiveSpeakingTime = Math.max(0.5, speechDur - pauseBetween * (sentences.length - 1));

    return sentences.map((sent, i) => {
      const charRatio = sent.length / totalChars;
      const sentDuration = Math.max(0.8, Number((effectiveSpeakingTime * charRatio).toFixed(2)));
      const start = Number(currentStart.toFixed(2));
      const end = Number((start + sentDuration).toFixed(2));
      currentStart = end + pauseBetween;
      return {
        id: i,
        start,
        end,
        duration: sentDuration,
        originalText: sent,
      };
    });
  }

  // Merge continuous words within a sentence, but strictly preserve real pauses (gap >= 0.45s)
  const grouped: SpeechSegment[] = [];
  let curStart = validRaw[0].start;
  let curEnd = validRaw[0].end;
  let curTexts = [validRaw[0].text];

  for (let i = 1; i < validRaw.length; i++) {
    const next = validRaw[i];
    const gap = next.start - curEnd;
    const lastText = curTexts[curTexts.length - 1];
    const endsWithTerminal = /[.!?]$/.test(lastText);

    // If gap between phrases is >= 0.45s, this is a genuine pause in speech!
    // Or if sentence is already > 3.5s and ends with punctuation, start a new segment.
    const isDistinctPause = gap >= 0.45;
    const isLongSentenceWithBreak = (curEnd - curStart) >= 3.5 && endsWithTerminal;

    if (isDistinctPause || isLongSentenceWithBreak) {
      grouped.push({
        id: grouped.length,
        start: curStart,
        end: curEnd,
        duration: Number((curEnd - curStart).toFixed(2)),
        originalText: curTexts.join(' '),
      });
      curStart = next.start;
      curEnd = next.end;
      curTexts = [next.text];
    } else {
      curEnd = Math.max(curEnd, next.end);
      curTexts.push(next.text);
    }
  }

  if (curTexts.length > 0) {
    grouped.push({
      id: grouped.length,
      start: curStart,
      end: curEnd,
      duration: Number((curEnd - curStart).toFixed(2)),
      originalText: curTexts.join(' '),
    });
  }

  // If acoustic VAD detected an initial pause >= 0.5s, align the first segment's start
  if (grouped.length > 0 && vadHint && vadHint.speechStartTime >= 0.5) {
    if (grouped[0].start < vadHint.speechStartTime - 0.4) {
      grouped[0].start = vadHint.speechStartTime;
      grouped[0].duration = Math.max(0.5, grouped[0].end - grouped[0].start);
    }
  }

  return grouped;
}

/**
 * Translates segments sentence-by-sentence with GPT-4o-mini, calibrating the
 * length/syllables of each Spanish phrase to fit within that phrase's exact time window.
 */
export async function translateSegmentsGPT(
  segments: SpeechSegment[],
  apiKey: string,
  totalVideoDuration?: number
): Promise<SpeechSegment[]> {
  if (segments.length === 0) return [];

  if (segments.length === 1) {
    const singleEs = await translateCopyGPT(segments[0].originalText, apiKey, segments[0].duration);
    return [
      {
        ...segments[0],
        translatedText: singleEs,
      },
    ];
  }

  const payload = segments.map((s) => ({
    id: s.id,
    start_sec: Number(s.start.toFixed(1)),
    duration_sec: Number(s.duration.toFixed(1)),
    text_pt: s.originalText,
  }));

  const systemPrompt =
`Você é um especialista em dublagem e copywriting para criativos de tráfego pago (TikTok, Reels, Shorts), com padrão de sincronia idêntico ao ElevenLabs.
O vídeo possui ${segments.length} frases com pausas reais entre elas.
Sua missão:
1. Traduzir cada frase do português para o espanhol latino neutro, mantendo tom persuasivo, ganchos e retenção.
2. CRÍTICO PARA SINCRONIA: O locutor no vídeo fez pausas entre as frases. Cada frase em espanhol será gravada separadamente e DEVE caber com perfeição dentro do tempo 'duration_sec' daquela frase com dicção humana natural (nem rápido demais nem devagar). Frases curtas devem ter poucas palavras; frases mais longas podem desenvolver mais a ideia.
3. Respeite a divisão em ${segments.length} frases e mantenha o mesmo "id".
4. Retorne EXCLUSIVAMENTE um objeto JSON com a propriedade "translations" no formato:
{
  "translations": [
    { "id": 0, "es": "frase 0 traduzida" },
    { "id": 1, "es": "frase 1 traduzida" }
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
      throw new Error(`Erro na tradução por frases (${res.status}): ${errDetail}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);
    const transList: Array<{ id: number; es: string }> = Array.isArray(parsed.translations)
      ? parsed.translations
      : Array.isArray(parsed)
      ? parsed
      : [];

    return segments.map((seg) => {
      const match = transList.find((t) => t.id === seg.id);
      const translatedText = match?.es ? String(match.es).trim() : seg.originalText;
      return {
        ...seg,
        translatedText,
      };
    });
  } catch (err) {
    console.warn('Fallback: translating segments individually:', err);
    return await Promise.all(
      segments.map(async (seg) => {
        try {
          const es = await translateCopyGPT(seg.originalText, apiKey, seg.duration);
          return { ...seg, translatedText: es };
        } catch {
          return { ...seg, translatedText: seg.originalText };
        }
      })
    );
  }
}

/**
 * Generates Spanish Speech for each individual segment using OpenAI TTS.
 * Keeps natural 1.0x human speaking rate, and only accelerates if a segment
 * would otherwise overlap into the subsequent segment.
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

    const nextSeg = segments[i + 1];
    // Maximum allowable duration before the next sentence starts
    const maxWindow = nextSeg
      ? Math.max(0.5, nextSeg.start - seg.start - 0.15) // preserve 150ms gap of silence
      : Math.max(0.5, totalVideoDuration - seg.start - 0.2);

    const { blob, duration, appliedSpeed } = await generateSynchronizedSpeechTTS(
      textToSpeak,
      apiKey,
      voice,
      model,
      maxWindow,
      forcedSpeed
    );

    updatedSegments.push({
      ...seg,
      audioBlob: blob,
      audioDuration: duration,
      appliedSpeed,
    });
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
 * Composes a full-length master audio track placing each speech segment at its
 * exact original timestamp, and preserving all acoustic pauses/breaths as silence.
 */
export async function composeMultiSegmentMasterTrack(
  segments: SpeechSegment[],
  exactVideoDuration: number,
  speechOffset: number = 0
): Promise<{ masterBlob: Blob; duration: number }> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioCtx();

  const decodedSegments: Array<{ buffer: AudioBuffer; start: number }> = [];
  for (const seg of segments) {
    if (!seg.audioBlob) continue;
    try {
      const arrBuf = await seg.audioBlob.arrayBuffer();
      const decoded = await tempCtx.decodeAudioData(arrBuf.slice(0));
      const targetStart = Math.max(0, seg.start + speechOffset);
      decodedSegments.push({ buffer: decoded, start: targetStart });
    } catch (e) {
      console.warn('Failed to decode segment audio buffer:', e);
    }
  }
  await tempCtx.close().catch(() => {});

  const sampleRate = 44100;
  const totalDuration = Math.max(1, exactVideoDuration);
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  for (const { buffer, start } of decodedSegments) {
    if (start >= totalDuration) continue;
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(start);
  }

  const rendered = await offlineCtx.startRendering();
  const masterWav = audioBufferToWavBlob(rendered);

  return {
    masterBlob: masterWav,
    duration: totalDuration,
  };
}

/**
 * Translate Copy from Portuguese to Persuasive Latin American Spanish using GPT-4o-mini.
 * Adapts copy length to fit naturally within the available video duration.
 */
export async function translateCopyGPT(
  originalPortugueseText: string,
  apiKey: string,
  availableTimeWindow?: number
): Promise<string> {
  const wordCount = originalPortugueseText.split(/\s+/).filter(Boolean).length;
  const timingDirective =
    availableTimeWindow && availableTimeWindow > 0
      ? `\n\n[DIRETRIZ DE ADAPTAÇÃO AO VÍDEO]:\nO tempo total disponível para a locução neste vídeo é de ${availableTimeWindow.toFixed(1)} segundos (~${wordCount} palavras no original). A fala em espanhol deve ser fluida, direta e persuasiva, com frases concisas que caibam confortavelmente nesse intervalo de tempo com dicção humana natural, sem correria e sem palavras desnecessárias.`
      : '';

  const systemPrompt =
    `Você é um especialista em dublagem e localização de criativos de alta conversão para tráfego pago (TikTok, Reels, Shorts), com padrão de naturalidade idêntico ao ElevenLabs.
Sua missão:
1. Traduzir e adaptar a fala do vídeo do português para o espanhol latino neutro com máxima fluidez e naturalidade humana.
2. Manter a energia, tom de voz, ritmo e ganchos persuasivos originais sem soar robótico ou literal.${timingDirective}
3. Retorne APENAS o texto traduzido final em espanhol, sem introduções, aspas extras ou comentários.`;

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
        { role: 'user', content: originalPortugueseText },
      ],
      temperature: 0.45,
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

      // 5. Start recorder, play video and master audio in absolute sync
      recorder.start(100);
      masterSourceNode.start(0);

      await videoEl.play().catch((playErr) => {
        console.warn('Video element play() was restricted, continuing frame capture:', playErr);
      });

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
