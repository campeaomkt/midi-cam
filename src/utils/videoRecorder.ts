import { VideoRecording } from '../types';

interface CachedKeyGeom {
  midi: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StartRecordingOptions {
  videoElement: HTMLVideoElement;
  filterString?: string;
  keyboardElement?: HTMLElement | null;
  getChord?: () => string | null;
  getNotes?: () => number[];
  audioTracks?: MediaStreamTrack[];
  recordingMode?: 'overlay' | 'direct';
}

export class VideoRecorderManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private startTime: number = 0;
  private timerInterval: number | null = null;
  private onTimeUpdate: ((seconds: number) => void) | null = null;
  private onRecordingComplete: ((recording: VideoRecording) => void) | null = null;
  private animFrameId: number | null = null;
  private compositeCanvas: HTMLCanvasElement | null = null;
  private currentVideoElement: HTMLVideoElement | null = null;

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public setTimeUpdateListener(cb: (seconds: number) => void) {
    this.onTimeUpdate = cb;
  }

  public setCompletionListener(cb: (recording: VideoRecording) => void) {
    this.onRecordingComplete = cb;
  }

  public startRecording(
    optionsOrElement: HTMLVideoElement | StartRecordingOptions,
    filterStringArg?: string,
    keyboardElementArg?: HTMLElement | null,
    activeChordOrGetter?: string | null | (() => string | null),
    activeNotesOrTracks?: number[] | MediaStreamTrack[] | (() => number[]),
    audioTracksArg: MediaStreamTrack[] = []
  ): boolean {
    if (this.isRecording) return false;

    // Normalize parameters
    let videoElement: HTMLVideoElement;
    let filterString: string = 'none';
    let keyboardElement: HTMLElement | null = null;
    let getChord: () => string | null = () => null;
    let getNotes: () => number[] = () => [];
    let audioTracks: MediaStreamTrack[] = [];

    let recordingMode: 'overlay' | 'direct' = 'overlay';

    if (optionsOrElement && 'videoElement' in optionsOrElement) {
      const opts = optionsOrElement as StartRecordingOptions;
      videoElement = opts.videoElement;
      filterString = opts.filterString || 'none';
      keyboardElement = opts.keyboardElement || null;
      recordingMode = opts.recordingMode || 'overlay';
      if (opts.getChord) getChord = opts.getChord;
      if (opts.getNotes) getNotes = opts.getNotes;
      if (opts.audioTracks) audioTracks = opts.audioTracks;
    } else {
      videoElement = optionsOrElement as HTMLVideoElement;
      filterString = filterStringArg || 'none';
      keyboardElement = keyboardElementArg || null;
      if (typeof activeChordOrGetter === 'function') {
        getChord = activeChordOrGetter;
      } else if (typeof activeChordOrGetter === 'string') {
        getChord = () => activeChordOrGetter;
      }
      if (typeof activeNotesOrTracks === 'function') {
        getNotes = activeNotesOrTracks as () => number[];
        audioTracks = audioTracksArg || [];
      } else if (Array.isArray(activeNotesOrTracks)) {
        if (activeNotesOrTracks.length > 0 && typeof activeNotesOrTracks[0] === 'number') {
          getNotes = () => activeNotesOrTracks as number[];
          audioTracks = audioTracksArg || [];
        } else {
          audioTracks = activeNotesOrTracks as MediaStreamTrack[];
        }
      }
    }

    if (!videoElement) return false;
    this.currentVideoElement = videoElement;

    try {
      this.recordedChunks = [];

      // Detect Android tablet / device
      const isAndroid =
        typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

      // Optimal 720p HD resolution: ensures rock-solid 30 FPS hardware encoding on Android tablets
      const rawW = videoElement.videoWidth || 1280;
      const rawH = videoElement.videoHeight || 720;
      const MAX_DIM = 1280;

      let width = rawW;
      let height = rawH;

      if (Math.max(width, height) > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Android hardware encoders (MediaCodec) strictly require dimensions divisible by 4
      width = Math.floor(width / 4) * 4;
      height = Math.floor(height / 4) * 4;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!ctx) return false;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';

      this.compositeCanvas = canvas;

      // Precompute keyboard geometry once - ZERO DOM queries inside animation loop!
      let cachedWhiteKeys: CachedKeyGeom[] = [];
      let cachedBlackKeys: CachedKeyGeom[] = [];
      let activeColor = '#3bf5b0';
      let activeDarkColor = '#20d778';
      let kbX = 0;
      let kbY = 0;
      let kbWidth = 0;
      let kbHeight = 0;

      if (keyboardElement) {
        activeColor = keyboardElement.getAttribute('data-active-color') || '#3bf5b0';
        activeDarkColor = keyboardElement.getAttribute('data-active-dark-color') || '#20d778';

        const whiteKeyButtons = Array.from(
          keyboardElement.querySelectorAll<HTMLElement>('[id^="piano-key-white-"]')
        );
        const blackKeyButtons = Array.from(
          keyboardElement.querySelectorAll<HTMLElement>('[id^="piano-key-black-"]')
        );

        if (whiteKeyButtons.length > 0) {
          // Precise relative positioning based on camera viewport
          const viewport = document.getElementById('camera-viewport-container') || videoElement.parentElement;
          if (viewport) {
            const vRect = viewport.getBoundingClientRect();
            const kRect = keyboardElement.getBoundingClientRect();
            if (vRect.width > 0 && vRect.height > 0 && kRect.width > 0) {
              kbWidth = (kRect.width / vRect.width) * width;
              kbHeight = (kRect.height / vRect.height) * height;
              kbX = ((kRect.left - vRect.left) / vRect.width) * width;
              kbY = ((kRect.top - vRect.top) / vRect.height) * height;
            }
          }

          if (kbWidth <= 0 || kbHeight <= 0) {
            const kbRect = keyboardElement.getBoundingClientRect();
            const actualAspect =
              kbRect.width > 0 && kbRect.height > 0
                ? kbRect.width / kbRect.height
                : whiteKeyButtons.length >= 35
                ? 7.6
                : whiteKeyButtons.length >= 25
                ? 6.2
                : 4.8;
            kbWidth = width * 0.92;
            kbHeight = kbWidth / actualAspect;
            kbX = (width - kbWidth) / 2;
            kbY = height * 0.28;
          }

          const numWhites = whiteKeyButtons.length;
          const keyW = kbWidth / numWhites;

          cachedWhiteKeys = whiteKeyButtons.map((btn, idx) => {
            const midi = parseInt(btn.id.replace('piano-key-white-', ''), 10) || 60;
            return {
              midi,
              x: kbX + idx * keyW,
              y: kbY,
              w: keyW,
              h: kbHeight,
            };
          });

          cachedBlackKeys = blackKeyButtons.map((btn) => {
            const midi = parseInt(btn.id.replace('piano-key-black-', ''), 10) || 61;
            const styleLeft = parseFloat(btn.style.left) || 0;
            const styleW = parseFloat(btn.style.width) || (keyW / kbWidth) * 60;
            const bW = (styleW / 100) * kbWidth;
            const bX = kbX + (styleLeft / 100) * kbWidth - bW / 2;
            const bH = kbHeight * 0.62;
            return {
              midi,
              x: bX,
              y: kbY,
              w: bW,
              h: bH,
            };
          });
        }
      }

      // Pre-calculate chord typography
      const chordFontSize = Math.max(16, Math.round(width * 0.065));
      const chordFont = `800 ${chordFontSize}px Outfit, -apple-system, sans-serif`;
      const chordY = kbY > 0 ? Math.max(chordFontSize + 12, kbY - chordFontSize * 0.75) : height * 0.22;

      // Strict 30 FPS Frame Throttling:
      const TARGET_FPS = 30;
      const FRAME_INTERVAL_MS = 1000 / TARGET_FPS; // ~33.3ms
      let lastDrawTime = 0;

      const render = (now: number) => {
        if (!this.isRecording && this.animFrameId === null) return;
        if (this.isRecording) {
          this.animFrameId = requestAnimationFrame(render);
        }

        // Throttle strictly to 30 FPS
        if (now - lastDrawTime < FRAME_INTERVAL_MS - 2) {
          return;
        }
        lastDrawTime = now;

        // 1. Draw camera video with direct GPU acceleration
        const isMirrored = videoElement.classList.contains('scale-x-[-1]') || (videoElement.style.transform && videoElement.style.transform.includes('scaleX(-1)'));
        if (isMirrored) {
          ctx.save();
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoElement, 0, 0, width, height);
          ctx.restore();
        } else {
          ctx.drawImage(videoElement, 0, 0, width, height);
        }

        // 2. Draw live chord banner if chord exists
        const currentChord = getChord();
        if (currentChord) {
          ctx.save();
          ctx.font = chordFont;
          const textMetrics = ctx.measureText(currentChord);
          const pillPaddingX = 20;
          const pillW = textMetrics.width + pillPaddingX * 2;
          const pillH = chordFontSize * 1.35;
          const pillX = (width - pillW) / 2;
          const pillY = chordY - pillH / 2;

          // Translucent dark badge for high readability
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
            ctx.fill();
          } else {
            ctx.fillRect(pillX, pillY, pillW, pillH);
          }

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fbbf24'; // Amber 400
          ctx.fillText(currentChord, width / 2, chordY);
          ctx.restore();
        }

        // 3. Draw piano keyboard overlay from pre-calculated geometry & active notes
        if (cachedWhiteKeys.length > 0) {
          const activeNotes = getNotes();
          const hasNotes = activeNotes && activeNotes.length > 0;

          // Keyboard background base
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(kbX, kbY, kbWidth, kbHeight);

          // Render White Keys
          for (let i = 0; i < cachedWhiteKeys.length; i++) {
            const key = cachedWhiteKeys[i];
            const isKeyActive = hasNotes && activeNotes.indexOf(key.midi) !== -1;

            if (isKeyActive) {
              ctx.save();
              ctx.shadowColor = activeColor;
              ctx.shadowBlur = 10;
              ctx.fillStyle = activeColor;
              ctx.fillRect(key.x, key.y, key.w, key.h);
              ctx.restore();
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(key.x, key.y, key.w, key.h);
            }

            // Key divider line
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(key.x + key.w, key.y);
            ctx.lineTo(key.x + key.w, key.y + key.h);
            ctx.stroke();
          }

          // Render Black Keys
          for (let i = 0; i < cachedBlackKeys.length; i++) {
            const key = cachedBlackKeys[i];
            const isKeyActive = hasNotes && activeNotes.indexOf(key.midi) !== -1;

            if (isKeyActive) {
              ctx.save();
              ctx.shadowColor = activeColor;
              ctx.shadowBlur = 8;
              ctx.fillStyle = activeDarkColor;
              ctx.fillRect(key.x, key.y, key.w, key.h);
              ctx.restore();
            } else {
              ctx.fillStyle = '#18181b';
              ctx.fillRect(key.x, key.y, key.w, key.h);
            }
          }
        }
      };

      // Determine video track source:
      let videoTracksToRecord: MediaStreamTrack[] = [];
      const isDirectMode = recordingMode === 'direct' && videoElement.srcObject instanceof MediaStream;

      if (isDirectMode) {
        const rawStream = videoElement.srcObject as MediaStream;
        videoTracksToRecord = rawStream.getVideoTracks();
      }

      // Safe fallback / overlay mode: capture rendered composite canvas
      if (videoTracksToRecord.length === 0) {
        const canvasStream = canvas.captureStream(30);
        videoTracksToRecord = canvasStream.getVideoTracks();
      }

      // CRITICAL FOR AUDIO-VIDEO SYNC:
      // Prime canvas with a first frame synchronously BEFORE MediaRecorder starts!
      render(performance.now());
      if (videoTracksToRecord[0] && (videoTracksToRecord[0] as any).requestFrame) {
        try {
          (videoTracksToRecord[0] as any).requestFrame();
        } catch {
          // ignore
        }
      }

      // Create mixed stream with audio
      const combinedTracks: MediaStreamTrack[] = [...videoTracksToRecord, ...audioTracks];
      const combinedStream = new MediaStream(combinedTracks);

      // Codec selection: Prioritize WebM on Android for 100% audio sync
      const mimeTypes = isIOS
        ? [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm',
          ]
        : [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm',
            'video/mp4;codecs=avc1',
            'video/mp4',
          ];

      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      // Configure MediaRecorder with smooth bitrate
      const options: MediaRecorderOptions = {
        ...(selectedMime ? { mimeType: selectedMime } : {}),
        videoBitsPerSecond: isAndroid ? 2500000 : 3500000,
      };

      this.mediaRecorder = new MediaRecorder(combinedStream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.finishRecording(selectedMime || 'video/webm');
      };

      // Set recording state and start loop before triggering recorder
      this.isRecording = true;
      this.startTime = Date.now();

      if (!isDirectMode) {
        this.animFrameId = requestAnimationFrame(render);
      }

      // Flushed every 200ms ensures audio and video chunks are tightly interleaved from frame 0
      this.mediaRecorder.start(200);

      // Start duration timer
      this.timerInterval = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.onTimeUpdate?.(elapsed);
      }, 500);

      return true;
    } catch (err) {
      console.error('Failed to start recording:', err);
      return false;
    }
  }

  public stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    this.isRecording = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  private finishRecording(mimeType: string) {
    const duration = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);

    // Generate thumbnail from current frame or composite canvas
    let thumbnailUrl = '';
    if (this.currentVideoElement && this.compositeCanvas) {
      try {
        const ctx = this.compositeCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(this.currentVideoElement, 0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
          thumbnailUrl = this.compositeCanvas.toDataURL('image/jpeg', 0.65);
        }
      } catch {
        thumbnailUrl = '';
      }
    }
    if (!thumbnailUrl && this.compositeCanvas) {
      try {
        thumbnailUrl = this.compositeCanvas.toDataURL('image/jpeg', 0.65);
      } catch {
        thumbnailUrl = '';
      }
    }

    const recording: VideoRecording = {
      id: `rec_${Date.now()}`,
      url,
      blob,
      duration,
      timestamp: Date.now(),
      thumbnailUrl,
      sizeBytes: blob.size,
      filterName: 'Custom',
    };

    this.onRecordingComplete?.(recording);
  }
}

export const videoRecorder = new VideoRecorderManager();
