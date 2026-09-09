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

    if (optionsOrElement && 'videoElement' in optionsOrElement) {
      const opts = optionsOrElement as StartRecordingOptions;
      videoElement = opts.videoElement;
      filterString = opts.filterString || 'none';
      keyboardElement = opts.keyboardElement || null;
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
          const kbRect = keyboardElement.getBoundingClientRect();
          const actualAspect =
            kbRect.width > 0 && kbRect.height > 0
              ? kbRect.width / kbRect.height
              : whiteKeyButtons.length >= 35
              ? 7.6
              : whiteKeyButtons.length >= 25
              ? 6.2
              : 4.8;
          kbWidth = width * 0.88;
          kbHeight = kbWidth / actualAspect;
          kbX = (width - kbWidth) / 2;
          kbY = height * 0.28;

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
      const chordY = height * 0.22;
      const chordFontSize = Math.round(width * 0.075);
      const chordFont = `800 ${chordFontSize}px Outfit, sans-serif`;

      // Strict 30 FPS Frame Throttling:
      // Prevents 90Hz/120Hz tablets from overwhelming GPU and dropping frames!
      const TARGET_FPS = 30;
      const FRAME_INTERVAL_MS = 1000 / TARGET_FPS; // ~33.3ms
      let lastDrawTime = 0;

      // On Android Chromium, ctx.filter with drawImage(video) causes Skia GPU memory leaks
      // and CPU software rasterization fallback after ~5 seconds.
      // We safely apply ctx.filter ONLY on iOS and desktop where Metal/DirectX runs it hardware-accelerated.
      const useCtxFilter = !isAndroid && filterString && filterString !== 'none';

      const render = (now: number) => {
        if (!this.isRecording) return;
        this.animFrameId = requestAnimationFrame(render);

        // Throttle strictly to 30 FPS
        if (now - lastDrawTime < FRAME_INTERVAL_MS - 2) {
          return;
        }
        lastDrawTime = now;

        // 1. Draw camera video with direct GPU acceleration
        if (useCtxFilter) {
          ctx.filter = filterString;
        } else {
          ctx.filter = 'none';
        }

        ctx.drawImage(videoElement, 0, 0, width, height);

        // Reset filter for overlays
        if (useCtxFilter) {
          ctx.filter = 'none';
        }

        // 2. Draw live chord banner if chord exists
        const currentChord = getChord();
        if (currentChord) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = chordFont;

          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 18;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 3;

          ctx.fillStyle = '#ffffff';
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

            ctx.fillStyle = isKeyActive ? activeColor : '#ffffff';
            ctx.fillRect(key.x, key.y, key.w, key.h);

            // Key divider
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

            ctx.fillStyle = isKeyActive ? activeDarkColor : '#18181b';
            ctx.fillRect(key.x, key.y, key.w, key.h);
          }
        }
      };

      // Get canvas stream (30 fps)
      const canvasStream = canvas.captureStream(30);

      // Create mixed stream with audio
      const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks(), ...audioTracks];
      const combinedStream = new MediaStream(combinedTracks);

      // Codec selection: Prioritize hardware-accelerated H.264 / MP4 (supported in Android 10+ Chrome)
      const mimeTypes = isIOS
        ? [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp8,opus',
            'video/webm',
          ]
        : isAndroid
        ? [
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=h264,opus',
            'video/webm;codecs=h264',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
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

      // Configure MediaRecorder with crisp 4.0 Mbps bitrate for clear camera quality
      const options: MediaRecorderOptions = {
        ...(selectedMime ? { mimeType: selectedMime } : {}),
        videoBitsPerSecond: 4000000,
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

      // Critical Android Fix:
      // Calling start() without timeslice on Android allows MediaCodec to encode continuous NAL units
      // without forcing buffer flushes every second, preventing the 5-second lag!
      if (isAndroid) {
        this.mediaRecorder.start();
      } else {
        this.mediaRecorder.start(1000);
      }

      this.isRecording = true;
      this.startTime = Date.now();

      // Start animation loop
      this.animFrameId = requestAnimationFrame(render);

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

    // Generate thumbnail from composite canvas
    let thumbnailUrl = '';
    if (this.compositeCanvas) {
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
