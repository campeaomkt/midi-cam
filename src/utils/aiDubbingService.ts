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
  customSpeed: number; // 0.75 to 1.5
  speechOffset: number; // fine-tune offset in seconds (-1.0 to 1.0)
}

export interface TranscriptionResult {
  text: string;
  duration: number; // total duration of audio in seconds
  speechStartTime: number; // in seconds (e.g. 1.2s)
  speechEndTime: number; // in seconds (e.g. 9.5s)
  speechDuration: number; // in seconds (e.g. 8.3s)
  wordCount: number;
  segments: Array<{ start: number; end: number; text: string }>;
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
 * Transcribe Audio in Portuguese using OpenAI Whisper API with precise segment timestamps
 */
export async function transcribeAudioWhisper(
  audioBlob: Blob,
  apiKey: string
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
  const duration = Number(data.duration) || 0;
  const segments = Array.isArray(data.segments) ? data.segments : [];

  let speechStartTime = 0;
  let speechEndTime = duration;

  if (segments.length > 0) {
    const validSegments = segments.filter((s: any) => s.text && s.text.trim().length > 0);
    if (validSegments.length > 0) {
      speechStartTime = Math.max(0, validSegments[0].start ?? 0);
      speechEndTime = Math.max(speechStartTime + 0.3, validSegments[validSegments.length - 1].end ?? duration);
    }
  }

  const speechDuration = Math.max(0.5, speechEndTime - speechStartTime);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    text,
    duration,
    speechStartTime,
    speechEndTime,
    speechDuration,
    wordCount,
    segments,
  };
}

/**
 * Translate Copy from Portuguese to Persuasive Latin American Spanish using GPT-4o-mini,
 * calibrating word count to match original speech duration.
 */
export async function translateCopyGPT(
  originalPortugueseText: string,
  apiKey: string,
  speechDuration?: number
): Promise<string> {
  const wordCount = originalPortugueseText.split(/\s+/).filter(Boolean).length;
  const timingConstraint =
    speechDuration && speechDuration > 0
      ? `\n\n[DIRETRIZ CRÍTICA DE SINCRONIZAÇÃO E CADÊNCIA COM O VÍDEO]:\nO locutor original falou em português por EXATAMENTE ${speechDuration.toFixed(1)} segundos (~${wordCount} palavras).\nSua tradução para o espanhol latino neutro DEVE manter uma extensão estritamente similar (cerca de ${wordCount} palavras) para que o locutor em espanhol consiga falar exatamente dentro dos mesmos ${speechDuration.toFixed(1)} segundos, mantendo a cadência e energia do criativo sem sobrar nem faltar tempo de vídeo.`
      : '';

  const systemPrompt =
    `Você é um copywriter nativo em espanhol latino neutro especializado em anúncios de conversão para tráfego pago (criativos de alta performance para TikTok, Reels e YouTube Shorts). Sua tarefa é traduzir e adaptar a copy do criativo em português para espanhol latino mantendo a mesma entonação enérgica, ritmo de fala, ganchos e chamadas para ação (CTA).${timingConstraint}\n\nRetorne estritamente o texto traduzido final em espanhol, sem aspas adicionais, introduções ou comentários.`;

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
      temperature: 0.5,
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
 * Generate Spanish Speech using OpenAI TTS API with speed control
 */
export async function generateSpeechTTS(
  spanishText: string,
  apiKey: string,
  voice: DubbingConfig['voice'] = 'onyx',
  model: DubbingConfig['model'] = 'tts-1-hd',
  speed: number = 1.0
): Promise<{ blob: Blob; duration: number; speed: number }> {
  const clampedSpeed = Math.min(2.0, Math.max(0.65, Number(speed.toFixed(2))));

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
 * Generates Spanish Speech and automatically calibrates speed so that the voiceover
 * finishes exactly within the target speech duration of the original video.
 */
export async function generateSynchronizedSpeechTTS(
  spanishText: string,
  apiKey: string,
  voice: DubbingConfig['voice'] = 'onyx',
  model: DubbingConfig['model'] = 'tts-1-hd',
  targetSpeechDuration?: number,
  forcedSpeed?: number
): Promise<{ blob: Blob; duration: number; appliedSpeed: number }> {
  // If user selected a custom/manual speed, use it directly
  if (forcedSpeed && forcedSpeed !== 1.0) {
    const res = await generateSpeechTTS(spanishText, apiKey, voice, model, forcedSpeed);
    return { blob: res.blob, duration: res.duration, appliedSpeed: res.speed };
  }

  // 1. Initial generation at natural 1.0x speed
  const firstPass = await generateSpeechTTS(spanishText, apiKey, voice, model, 1.0);

  // If no target speech duration is provided or measurement failed, return first pass
  if (!targetSpeechDuration || targetSpeechDuration <= 0.5 || firstPass.duration <= 0.5) {
    return { blob: firstPass.blob, duration: firstPass.duration, appliedSpeed: 1.0 };
  }

  // 2. Evaluate duration discrepancy
  const ratio = firstPass.duration / targetSpeechDuration;

  // If within 10% tolerance, the speed is already well matched
  if (ratio >= 0.90 && ratio <= 1.10) {
    return { blob: firstPass.blob, duration: firstPass.duration, appliedSpeed: 1.0 };
  }

  // Calculate target speed clamped between 0.70x and 1.60x for natural human voiceover
  const targetSpeed = Math.min(1.60, Math.max(0.70, Number(ratio.toFixed(2))));

  // 3. Re-generate with perfectly matched speed
  try {
    const calibratedPass = await generateSpeechTTS(
      spanishText,
      apiKey,
      voice,
      model,
      targetSpeed
    );
    return {
      blob: calibratedPass.blob,
      duration: calibratedPass.duration,
      appliedSpeed: calibratedPass.speed,
    };
  } catch (calibErr) {
    console.warn('Speed calibration fallback to first pass:', calibErr);
    return { blob: firstPass.blob, duration: firstPass.duration, appliedSpeed: 1.0 };
  }
}

export interface AssembleDubbedVideoOptions {
  speechStartTime?: number; // Detected start timestamp of speech in seconds
  speechOffset?: number;    // Manual fine-tune offset in seconds
  onProgress?: (percent: number) => void;
}

/**
 * Client-side Audio Replacement & Video Assembly:
 * 1. Completely mutes and discards the original video's microphone audio track (the Portuguese voice is 100% removed).
 * 2. Injects the Spanish TTS audio track synchronized to the exact speech start timestamp.
 * 3. Mounts the video in the active viewport (opacity 0.001) to prevent background browser frame throttling.
 * 4. Outputs a final video matching the exact duration and frame pacing of the original clip.
 */
export async function assembleDubbedVideo(
  videoUrlOrBlob: string | Blob,
  newAudioBlob: Blob,
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
      // 1. Initialize Web Audio API
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // 2. Decode Spanish TTS Audio via Web Audio API -> AudioBuffer
      const ttsArrayBuf = await newAudioBlob.arrayBuffer();
      const ttsAudioBuffer = await audioCtx.decodeAudioData(ttsArrayBuf.slice(0));

      // 3. Create Stream Destination for MediaRecorder
      // CRITICAL: ONLY the Spanish TTS voice is connected. The original microphone audio
      // containing the Portuguese speech is NEVER connected, ensuring 100% replacement.
      const audioDestNode = audioCtx.createMediaStreamDestination();

      const ttsSourceNode = audioCtx.createBufferSource();
      ttsSourceNode.buffer = ttsAudioBuffer;
      const ttsGain = audioCtx.createGain();
      ttsGain.gain.setValueAtTime(1.15, audioCtx.currentTime);
      ttsSourceNode.connect(ttsGain);
      ttsGain.connect(audioDestNode);

      // 4. Setup Video Element in DOM inside active viewport
      // CRITICAL FIX: Keeping it in viewport (top: 0, left: 0, opacity: 0.001) prevents
      // Chromium and Safari from throttling video decoding to 1-2 fps as an "offscreen" element!
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
        setTimeout(res, 250);
      });

      const videoDuration = Math.max(
        1,
        videoEl.duration && isFinite(videoEl.duration) ? videoEl.duration : 10
      );
      const width = videoEl.videoWidth || 1280;
      const height = videoEl.videoHeight || 720;

      // 5. Setup Canvas and MediaRecorder Stream
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

      // Detect supported mimeType
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
          duration: Math.round(videoDuration),
        });
      };

      recorder.onerror = (err) => {
        cleanup();
        reject(err);
      };

      // 6. Start recorder and synchronized playback
      recorder.start(100);

      // Play video element
      await videoEl.play().catch((playErr) => {
        console.warn('Video element play() was restricted, continuing frame capture:', playErr);
      });

      // Align Spanish audio start with exact speech start timestamp
      const scheduledStartOffset = Math.max(
        0,
        (options.speechStartTime || 0) + (options.speechOffset || 0)
      );
      const audioStartTime = audioCtx.currentTime + scheduledStartOffset;
      ttsSourceNode.start(audioStartTime);

      // 7. Video Frame Render Loop driven by videoEl.currentTime
      const renderLoop = () => {
        if (completed) return;

        // Draw current decoded video frame
        if (videoEl && videoEl.readyState >= 2) {
          ctx.drawImage(videoEl, 0, 0, width, height);
        }

        const curTime = videoEl ? videoEl.currentTime : 0;

        // Progress notification
        if (options.onProgress && videoDuration > 0) {
          const pct = Math.min(99, Math.round((curTime / videoDuration) * 100));
          options.onProgress(pct);
        }

        // Completion check: stop exactly when video reaches its end
        if (videoEl && (videoEl.ended || curTime >= videoDuration - 0.08)) {
          completed = true;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        animId = requestAnimationFrame(renderLoop);
      };

      animId = requestAnimationFrame(renderLoop);

      // Safety timeout in case frame timing stalls
      setTimeout(() => {
        if (!completed && recorder.state === 'recording') {
          completed = true;
          recorder.stop();
        }
      }, (videoDuration + 4) * 1000);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
