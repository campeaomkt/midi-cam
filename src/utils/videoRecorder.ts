import { VideoRecording } from '../types';

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
    videoElement: HTMLVideoElement,
    filterString: string,
    keyboardElement: HTMLElement | null,
    chordName: string | null,
    audioTracks: MediaStreamTrack[] = []
  ): boolean {
    if (this.isRecording) return false;

    try {
      this.recordedChunks = [];

      // Create high-performance 1080p canvas for composite
      const width = videoElement.videoWidth || 1080;
      const height = videoElement.videoHeight || 1920;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return false;

      this.compositeCanvas = canvas;

      // Start rendering loop with filters & overlays
      const render = () => {
        if (!this.isRecording) return;

        ctx.save();
        // Apply active video filter
        if (filterString && filterString !== 'none') {
          ctx.filter = filterString;
        } else {
          ctx.filter = 'none';
        }

        // Draw camera video feed
        ctx.drawImage(videoElement, 0, 0, width, height);
        ctx.restore();

        // Draw overlay watermark / chord banner if chord exists
        const currentChord = (document.getElementById('detected-chord-text')?.textContent || '').trim();
        if (currentChord) {
          ctx.save();
          // Draw chord text
          const chordY = height * 0.22;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `800 ${Math.round(width * 0.075)}px Outfit, sans-serif`;

          // Outer dark glow/shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = 24;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4;

          ctx.fillStyle = '#ffffff';
          ctx.fillText(currentChord, width / 2, chordY);
          ctx.restore();
        }

        // Draw floating piano keyboard overlay onto video frame
        if (keyboardElement) {
          const whiteKeyButtons = keyboardElement.querySelectorAll<HTMLButtonElement>('[id^="piano-key-white-"]');
          const blackKeyButtons = keyboardElement.querySelectorAll<HTMLButtonElement>('[id^="piano-key-black-"]');

          if (whiteKeyButtons.length > 0) {
            ctx.save();
            const kbRect = keyboardElement.getBoundingClientRect();
            const actualAspect =
              kbRect.width > 0 && kbRect.height > 0
                ? kbRect.width / kbRect.height
                : whiteKeyButtons.length >= 35
                ? 7.6
                : whiteKeyButtons.length >= 25
                ? 6.2
                : 4.8;
            const kbWidth = width * 0.88;
            const kbHeight = kbWidth / actualAspect;
            const kbX = (width - kbWidth) / 2;
            const kbY = height * 0.28;

            // Draw subtle shadow for the keyboard (no rounded borders)
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 24;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.rect(kbX, kbY, kbWidth, kbHeight);
            ctx.fill();
            ctx.shadowColor = 'transparent';

            const numWhites = whiteKeyButtons.length;
            const keyW = kbWidth / numWhites;
            const activeColor = keyboardElement.getAttribute('data-active-color') || '#3bf5b0';
            const activeDarkColor = keyboardElement.getAttribute('data-active-dark-color') || '#20d778';
            const glowAttr = keyboardElement.getAttribute('data-glow-intensity');
            const glowIntensity = glowAttr !== null ? parseFloat(glowAttr) : 80;

            // Render white keys
            whiteKeyButtons.forEach((btn, idx) => {
              const isKeyActive = btn.className.includes('shadow-inner') || btn.className.includes('bg-gradient-to-t') || btn.className.includes('scale-y-');
              const kX = kbX + idx * keyW;

              if (isKeyActive && glowIntensity > 0) {
                ctx.shadowColor = activeColor;
                ctx.shadowBlur = Math.round((glowIntensity / 100) * 14);
              } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
              }

              ctx.fillStyle = isKeyActive ? activeColor : '#ffffff';
              ctx.fillRect(kX, kbY, keyW, kbHeight);
              ctx.shadowColor = 'transparent';

              // Subtle key divider
              ctx.strokeStyle = '#d1d5db';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(kX + keyW, kbY);
              ctx.lineTo(kX + keyW, kbY + kbHeight);
              ctx.stroke();
            });

            // Render black keys (sharp square edges)
            blackKeyButtons.forEach((btn) => {
              const isKeyActive = btn.className.includes('shadow-inner') && !btn.className.includes('bg-[#18181b]');
              const styleLeft = parseFloat(btn.style.left) || 0;
              const styleW = parseFloat(btn.style.width) || (keyW / kbWidth) * 60;
              const bW = (styleW / 100) * kbWidth;
              const bX = kbX + (styleLeft / 100) * kbWidth - bW / 2;
              const bH = kbHeight * 0.62;

              if (isKeyActive && glowIntensity > 0) {
                ctx.shadowColor = activeDarkColor;
                ctx.shadowBlur = Math.round((glowIntensity / 100) * 14);
                ctx.shadowOffsetY = 0;
              } else {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetY = 3;
              }

              ctx.fillStyle = isKeyActive ? activeDarkColor : '#18181b';
              ctx.beginPath();
              ctx.rect(bX, kbY, bW, bH);
              ctx.fill();
              ctx.shadowColor = 'transparent';
            });

            ctx.restore();
          }
        }

        this.animFrameId = requestAnimationFrame(render);
      };

      // Get canvas stream
      const canvasStream = canvas.captureStream(30);

      // Create mixed stream with audio
      const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks(), ...audioTracks];
      const combinedStream = new MediaStream(combinedTracks);

      // Select supported mime type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const options: MediaRecorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      this.mediaRecorder = new MediaRecorder(combinedStream, options);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.finishRecording(selectedMime || 'video/webm');
      };

      this.mediaRecorder.start(250); // timeslice 250ms
      this.isRecording = true;
      this.startTime = Date.now();

      // Start animation loop
      render();

      // Start timer
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
        thumbnailUrl = this.compositeCanvas.toDataURL('image/jpeg', 0.7);
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
