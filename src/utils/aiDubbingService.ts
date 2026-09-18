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
      };
    }
  } catch (err) {
    console.warn('Error reading stored OpenAI config:', err);
  }
  return {
    apiKey: '',
    voice: 'onyx',
    model: 'tts-1-hd',
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
 * Extracts audio from a video blob as a WAV audio file ready for OpenAI Whisper
 */
export async function extractAudioFromVideoBlob(videoBlob: Blob): Promise<Blob> {
  const arrayBuffer = await videoBlob.arrayBuffer();
  
  // Use OfflineAudioContext to decode and resample cleanly
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioContextClass();
  
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (decodeErr) {
    await tempCtx.close();
    // Fallback: If decode fails directly on webm, return the original audio/webm blob slice
    console.warn('Direct decodeAudioData failed, sending video blob as audio slice for Whisper:', decodeErr);
    return new Blob([videoBlob], { type: 'audio/webm' });
  }
  await tempCtx.close();

  // Convert AudioBuffer to 16-bit Mono WAV (16kHz or 24kHz, optimal for Whisper)
  const targetSampleRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWavBlob(renderedBuffer);
}

/**
 * Encode an AudioBuffer into standard RIFF PCM 16-bit Mono WAV
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = 1;
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
  channels.push(buffer.getChannelData(0));

  while (pos < length) {
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
 * Transcribe Audio in Portuguese using OpenAI Whisper API
 */
export async function transcribeAudioWhisper(
  audioBlob: Blob,
  apiKey: string
): Promise<string> {
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
  return (data.text || '').trim();
}

/**
 * Translate Copy from Portuguese to Persuasive Latin American Spanish using GPT-4o-mini
 */
export async function translateCopyGPT(
  originalPortugueseText: string,
  apiKey: string
): Promise<string> {
  const systemPrompt =
    'Você é um copywriter nativo em espanhol latino neutro especializado em anúncios de conversão para tráfego pago. Sua tarefa é traduzir a copy do criativo em português para espanhol mantendo a mesma entonação enérgica, ritmo de fala, gatilhos mentais e chamadas para ação (CTA). Mantenha o tamanho das frases o mais próximo possível do original para coincidir com a duração do vídeo. Retorne apenas o texto traduzido final em espanhol, sem aspas adicionais ou comentários.';

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
      temperature: 0.6,
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
  model: DubbingConfig['model'] = 'tts-1-hd'
): Promise<Blob> {
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
  return audioBlob;
}

/**
 * Client-side Audio Replacement & Video Assembly:
 * Takes the original video and replaces its audio track with the new Spanish TTS audio track
 * using HTMLVideoElement + Web Audio API + MediaStreamDestination + MediaRecorder.
 * Works 100% in browser without requiring heavy wasm binaries.
 */
export async function assembleDubbedVideo(
  videoUrlOrBlob: string | Blob,
  newAudioBlob: Blob,
  onProgress?: (percent: number) => void
): Promise<{ blob: Blob; url: string; duration: number }> {
  return new Promise(async (resolve, reject) => {
    try {
      const videoSrc = typeof videoUrlOrBlob === 'string' ? videoUrlOrBlob : URL.createObjectURL(videoUrlOrBlob);
      const audioSrc = URL.createObjectURL(newAudioBlob);

      const videoEl = document.createElement('video');
      videoEl.src = videoSrc;
      videoEl.muted = true; // Mute video original audio
      videoEl.crossOrigin = 'anonymous';
      videoEl.playsInline = true;
      (videoEl as any).webkitPlaysInline = true;

      const audioEl = document.createElement('audio');
      audioEl.src = audioSrc;

      // Wait for metadata
      await Promise.all([
        new Promise((res) => {
          videoEl.onloadedmetadata = res;
          videoEl.onerror = () => res(null);
        }),
        new Promise((res) => {
          audioEl.onloadedmetadata = res;
          audioEl.onerror = () => res(null);
        }),
      ]);

      const videoDuration = videoEl.duration || 10;
      const audioDuration = audioEl.duration || videoDuration;
      // We render for the duration of the video or audio (whichever is needed)
      const targetDuration = Math.max(videoDuration, audioDuration);

      const width = videoEl.videoWidth || 1280;
      const height = videoEl.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Não foi possível obter contexto 2D do canvas');
      }

      // Audio setup via Web Audio API
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const audioSourceNode = audioCtx.createMediaElementSource(audioEl);
      const audioDestNode = audioCtx.createMediaStreamDestination();
      audioSourceNode.connect(audioDestNode);
      // Also connect to null or keep destination

      // Capture Canvas Stream (30 FPS)
      const canvasStream = canvas.captureStream(30);
      const videoTrack = canvasStream.getVideoTracks()[0];
      const audioTrack = audioDestNode.stream.getAudioTracks()[0];

      if (!videoTrack || !audioTrack) {
        throw new Error('Falha ao obter tracks de mídia para a montagem');
      }

      const combinedStream = new MediaStream([videoTrack, audioTrack]);

      // Choose supported mimeType
      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      const mimeCandidates = isIOS
        ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm']
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
        videoBitsPerSecond: 3500000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      let animId: number | null = null;
      let completed = false;

      const cleanup = () => {
        if (animId) cancelAnimationFrame(animId);
        videoEl.pause();
        audioEl.pause();
        audioCtx.close().catch(() => {});
        URL.revokeObjectURL(audioSrc);
        if (typeof videoUrlOrBlob !== 'string') {
          URL.revokeObjectURL(videoSrc);
        }
      };

      recorder.onstop = () => {
        cleanup();
        const finalBlob = new Blob(chunks, { type: chosenMime || 'video/webm' });
        const finalUrl = URL.createObjectURL(finalBlob);
        resolve({
          blob: finalBlob,
          url: finalUrl,
          duration: Math.round(targetDuration),
        });
      };

      recorder.onerror = (err) => {
        cleanup();
        reject(err);
      };

      // Animation render loop
      const drawFrame = () => {
        if (completed) return;

        if (videoEl.readyState >= 2) {
          ctx.drawImage(videoEl, 0, 0, width, height);
        }

        const currentTime = Math.max(videoEl.currentTime, audioEl.currentTime);
        if (onProgress && targetDuration > 0) {
          const pct = Math.min(99, Math.round((currentTime / targetDuration) * 100));
          onProgress(pct);
        }

        // Check if finished
        if (currentTime >= targetDuration - 0.1 || (videoEl.ended && audioEl.ended)) {
          completed = true;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        animId = requestAnimationFrame(drawFrame);
      };

      // Start everything
      recorder.start(100);
      await audioCtx.resume();
      await Promise.all([
        videoEl.play().catch(() => {}),
        audioEl.play().catch(() => {}),
      ]);
      animId = requestAnimationFrame(drawFrame);

      // Fallback timeout in case playback stalls
      setTimeout(() => {
        if (!completed && recorder.state === 'recording') {
          completed = true;
          recorder.stop();
        }
      }, (targetDuration + 3) * 1000);
    } catch (err) {
      reject(err);
    }
  });
}
