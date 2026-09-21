import { VideoRecording, KeyboardSettings } from '../types';
import { generateKeyboardLayout, KeyData } from '../components/VirtualKeyboard';
import { getEffectiveActiveColor, getDarkerShade, getLighterShade } from './keyboardColor';

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
  aspectRatio?: '9:16' | '16:9' | 'auto';
  keyboardSettings?: KeyboardSettings;
  chordColor?: string;
  chordFontSize?: 'medium' | 'large' | 'huge';
  chordPlacement?: 'above' | 'below';
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
    let aspectRatio: '9:16' | '16:9' | 'auto' = '9:16';
    let keyboardSettings: KeyboardSettings | undefined;
    let chordColor: string = '#ffffff';
    let chordFontSize: 'medium' | 'large' | 'huge' = 'large';
    let chordPlacement: 'above' | 'below' = 'above';

    if (optionsOrElement && 'videoElement' in optionsOrElement) {
      const opts = optionsOrElement as StartRecordingOptions;
      videoElement = opts.videoElement;
      filterString = opts.filterString || 'none';
      keyboardElement = opts.keyboardElement || null;
      recordingMode = opts.recordingMode || 'overlay';
      aspectRatio = opts.aspectRatio || '9:16';
      keyboardSettings = opts.keyboardSettings;
      if (opts.chordColor) chordColor = opts.chordColor;
      if (opts.chordFontSize) chordFontSize = opts.chordFontSize;
      if (opts.chordPlacement) chordPlacement = opts.chordPlacement;
      else if (opts.keyboardSettings?.chordPlacement) chordPlacement = opts.keyboardSettings.chordPlacement;
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

      // Sensor native dimensions
      const rawW = videoElement.videoWidth || 1280;
      const rawH = videoElement.videoHeight || 720;

      let width = rawW;
      let height = rawH;
      let srcX = 0;
      let srcY = 0;
      let srcW = rawW;
      let srcH = rawH;

      if (aspectRatio === '9:16') {
        // Enforce 9:16 vertical recording (essential for PC webcams and Reels/Shorts)
        height = 1280;
        width = 720;
        const targetRatio = 9 / 16;
        const currentRatio = rawW / rawH;

        if (currentRatio > targetRatio) {
          // Camera is wider (e.g. 16:9 on PC). Center crop horizontally:
          srcH = rawH;
          srcW = Math.round(srcH * targetRatio);
          srcX = Math.round((rawW - srcW) / 2);
          srcY = 0;
        } else {
          // Camera is taller. Center crop vertically:
          srcW = rawW;
          srcH = Math.round(srcW / targetRatio);
          srcX = 0;
          srcY = Math.round((rawH - srcH) / 2);
        }
      } else if (aspectRatio === '16:9') {
        // Enforce 16:9 horizontal recording
        width = 1280;
        height = 720;
        const targetRatio = 16 / 9;
        const currentRatio = rawW / rawH;

        if (currentRatio > targetRatio) {
          srcH = rawH;
          srcW = Math.round(srcH * targetRatio);
          srcX = Math.round((rawW - srcW) / 2);
          srcY = 0;
        } else {
          srcW = rawW;
          srcH = Math.round(srcW / targetRatio);
          srcX = 0;
          srcY = Math.round((rawH - srcH) / 2);
        }
      } else {
        // Auto: scale while maintaining native aspect ratio
        const MAX_DIM = 1280;
        if (Math.max(width, height) > MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
      }

      // Hardware encoders strictly require dimensions divisible by 4
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

      // Precompute keyboard configuration and geometry once - ZERO DOM queries inside animation loop!
      const keyCount = keyboardSettings?.keyCount || 37;
      const octaveShift = keyboardSettings?.octaveShift || 0;
      const visualModel = keyboardSettings?.visualModel || 'realistic-3d';
      const theme = keyboardSettings?.theme || 'cyan';
      const customColor = keyboardSettings?.customColor;
      const showNoteNames = keyboardSettings?.showNoteNames || false;

      const { whiteKeys, blackKeys, totalWhiteKeys } = generateKeyboardLayout(keyCount, octaveShift);
      const effectiveColor = getEffectiveActiveColor(theme, customColor);
      const lighterColor = getLighterShade(effectiveColor, 18);
      const darkerColor = getDarkerShade(effectiveColor, 22);
      const deepDarkColor = getDarkerShade(effectiveColor, 38);

      let kbX = 0;
      let kbY = 0;
      let kbWidth = 0;
      let kbHeight = 0;

      const viewport = document.getElementById('camera-viewport-container') || videoElement.parentElement;
      if (viewport && keyboardElement) {
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
        kbWidth = width * 0.94;
        kbX = (width - kbWidth) / 2;
        const customY = keyboardSettings?.customYPercent ?? 20;
        kbY = height * (customY / 100);
        kbHeight = visualModel === 'realistic-3d' ? kbWidth / (1200 / 280) : kbWidth / 5.2;
      }

      // Enforce proper aspect ratio for 3D model
      if (visualModel === 'realistic-3d') {
        const desiredHeight = kbWidth / (1200 / 280);
        kbHeight = desiredHeight;
      }

      // Pre-calculate chord typography and vertical placement
      const is916 = (aspectRatio || '9:16') === '9:16';
      const fontMultiplier = is916
        ? (chordFontSize === 'huge' ? 0.052 : chordFontSize === 'large' ? 0.042 : 0.034)
        : (chordFontSize === 'huge' ? 0.088 : chordFontSize === 'large' ? 0.074 : 0.06);
      const chordFontSizePx = Math.max(16, Math.round(width * fontMultiplier));
      const chordFont = `800 ${chordFontSizePx}px Outfit, -apple-system, sans-serif`;

      let chordY = 0;
      if (chordPlacement === 'below') {
        chordY = kbY + kbHeight + chordFontSizePx * 0.95;
      } else {
        chordY = Math.max(chordFontSizePx + 12, kbY - chordFontSizePx * 0.75);
      }

      // Isometric 3D Projection parameters matching Isometric3DKeyboard.tsx
      const svgW = 1200;
      const svgH = 280;
      const cx = svgW / 2;
      const frontLeft = 18;
      const frontRight = svgW - 18;
      const frontW = frontRight - frontLeft;
      const yTop = 20;
      const yFront = 216;
      const yBottom = 268;
      const backRatio = 0.932;
      const scaleX = kbWidth / svgW;
      const scaleY = kbHeight / svgH;

      const projectXb = (xf: number) => cx + (xf - cx) * backRatio;
      const pt = (sx: number, sy: number) => ({
        x: kbX + sx * scaleX,
        y: kbY + sy * scaleY,
      });

      const drawPoly = (points: { x: number; y: number }[], fill: string, stroke?: string, strokeW = 1) => {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = strokeW;
          ctx.stroke();
        }
      };

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

        // 1. Draw camera video with direct GPU acceleration and aspect-ratio cropping
        const isMirrored = videoElement.classList.contains('scale-x-[-1]') || (videoElement.style.transform && videoElement.style.transform.includes('scaleX(-1)'));
        if (isMirrored) {
          ctx.save();
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoElement, srcX, srcY, srcW, srcH, 0, 0, width, height);
          ctx.restore();
        } else {
          ctx.drawImage(videoElement, srcX, srcY, srcW, srcH, 0, 0, width, height);
        }

        // 2. Draw live chord matching on-screen color, font, and placement
        const currentChord = getChord();
        if (currentChord) {
          ctx.save();
          ctx.font = chordFont;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = Math.round(chordFontSizePx * 0.35);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = chordColor || '#ffffff';
          ctx.fillText(currentChord, width / 2, chordY);
          ctx.restore();
        }

        // 3. Draw piano keyboard overlay matching selected visual model
        const activeNotes = getNotes() || [];
        const activeSet = new Set(activeNotes);

        if (visualModel === 'realistic-3d') {
          // Render 3D Isometric White Keys
          for (let i = 0; i < whiteKeys.length; i++) {
            const key = whiteKeys[i];
            const isActive = activeSet.has(key.midi);
            const xf0 = frontLeft + (i / totalWhiteKeys) * frontW;
            const xf1 = frontLeft + ((i + 1) / totalWhiteKeys) * frontW;
            const xb0 = projectXb(xf0);
            const xb1 = projectXb(xf1);

            const frontFaceHeight = yBottom - yFront;
            const ySink = isActive ? frontFaceHeight * 0.5 : 0;

            // Outer left side face for key 0
            if (i === 0) {
              drawPoly(
                [
                  pt(xb0, yTop),
                  pt(xf0, yFront + ySink),
                  pt(xf0, yBottom),
                  pt(xb0, yTop + frontFaceHeight),
                ],
                isActive ? darkerColor : '#7b7e87',
                '#1c1c1f',
                1
              );
            }
            // Outer right side face for last key
            if (i === totalWhiteKeys - 1) {
              drawPoly(
                [
                  pt(xb1, yTop),
                  pt(xf1, yFront + ySink),
                  pt(xf1, yBottom),
                  pt(xb1, yTop + frontFaceHeight),
                ],
                isActive ? darkerColor : '#7b7e87',
                '#1c1c1f',
                1
              );
            }

            // Top Face (slanted perspective)
            drawPoly(
              [
                pt(xb0, yTop),
                pt(xb1, yTop),
                pt(xf1, yFront + ySink),
                pt(xf0, yFront + ySink),
              ],
              isActive ? lighterColor : '#ffffff',
              '#1c1c1f',
              1
            );

            // Front Face (depressed when active)
            drawPoly(
              [
                pt(xf0, yFront + ySink),
                pt(xf1, yFront + ySink),
                pt(xf1, yBottom),
                pt(xf0, yBottom),
              ],
              isActive ? darkerColor : '#8f929b',
              '#1c1c1f',
              1
            );

            // Note name if enabled
            if (showNoteNames) {
              const lbl = key.pitchClass === 0 || key.whiteIndex === 0
                ? `${key.name}${key.octave}`
                : key.name;
              ctx.save();
              ctx.font = `bold ${Math.max(8, Math.round(11 * scaleY))}px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillStyle = isActive ? '#09090b' : '#71717a';
              const mid = pt((xf0 + xf1) / 2, yFront + ySink - 8);
              ctx.fillText(lbl, mid.x, mid.y);
              ctx.restore();
            }
          }

          // Render 3D Isometric Black Keys
          for (let b = 0; b < blackKeys.length; b++) {
            const key = blackKeys[b];
            const isActive = activeSet.has(key.midi);
            const seamXf = frontLeft + (key.whiteIndex / totalWhiteKeys) * frontW;
            const seamXb = projectXb(seamXf);

            const tFront = 0.61;
            const baseY_top = yTop;
            const baseX_top = seamXb;
            const baseY_front = yTop + tFront * (yFront - yTop);
            const baseX_front = seamXb + tFront * (seamXf - seamXb);

            const wWhiteFront = frontW / totalWhiteKeys;
            const wWhiteBack = (frontW * backRatio) / totalWhiteKeys;
            const hwFront = (wWhiteFront * 0.63) / 2;
            const hwBack = (wWhiteBack * 0.63) / 2;

            const b_tl = { x: baseX_top - hwBack, y: baseY_top };
            const b_tr = { x: baseX_top + hwBack, y: baseY_top };
            const b_fr = { x: baseX_front + hwFront, y: baseY_front };
            const b_fl = { x: baseX_front - hwFront, y: baseY_front };

            const elev = isActive ? 5 : 14;
            const t_tl = { x: b_tl.x, y: yTop };
            const t_tr = { x: b_tr.x, y: yTop };
            const t_fr = { x: b_fr.x, y: b_fr.y - elev };
            const t_fl = { x: b_fl.x, y: b_fl.y - elev };

            const dx = baseX_front - cx;
            const isLeft = dx < -12;
            const isRight = dx > 12;

            // Shadow
            const shadowDx = dx * 0.012;
            drawPoly(
              [
                pt(b_fl.x, b_fl.y),
                pt(b_fr.x, b_fr.y),
                pt(b_fr.x + shadowDx, b_fr.y + 6),
                pt(b_fl.x + shadowDx, b_fl.y + 6),
              ],
              'rgba(0, 0, 0, 0.45)'
            );

            // Side faces
            if (isLeft) {
              drawPoly(
                [
                  pt(t_tr.x, t_tr.y),
                  pt(t_fr.x, t_fr.y),
                  pt(b_fr.x, b_fr.y),
                  pt(b_tr.x, b_tr.y),
                ],
                isActive ? darkerColor : '#1b1c20',
                '#121316',
                0.75
              );
            }
            if (isRight) {
              drawPoly(
                [
                  pt(t_tl.x, t_tl.y),
                  pt(t_fl.x, t_fl.y),
                  pt(b_fl.x, b_fl.y),
                  pt(b_tl.x, b_tl.y),
                ],
                isActive ? darkerColor : '#1b1c20',
                '#121316',
                0.75
              );
            }

            // Front face
            drawPoly(
              [
                pt(t_fl.x, t_fl.y),
                pt(t_fr.x, t_fr.y),
                pt(b_fr.x, b_fr.y),
                pt(b_fl.x, b_fl.y),
              ],
              isActive ? deepDarkColor : '#0c0d10',
              '#121316',
              0.75
            );

            // Top face
            drawPoly(
              [
                pt(t_tl.x, t_tl.y),
                pt(t_tr.x, t_tr.y),
                pt(t_fr.x, t_fr.y),
                pt(t_fl.x, t_fl.y),
              ],
              isActive ? effectiveColor : '#25262a',
              '#141416',
              0.75
            );

            if (showNoteNames) {
              ctx.save();
              ctx.font = `bold ${Math.max(7, Math.round(9 * scaleY))}px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isActive ? '#09090b' : '#a1a1aa';
              const mid = pt((t_fl.x + t_fr.x) / 2, (t_tl.y + t_fr.y) / 2);
              ctx.fillText(key.name, mid.x, mid.y);
              ctx.restore();
            }
          }
        } else {
          // Acoustic / Flat keyboard rendering
          const keyW = kbWidth / totalWhiteKeys;

          // Background base
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(kbX, kbY, kbWidth, kbHeight);

          // Red felt bar for acoustic model
          if (visualModel === 'realistic-acoustic') {
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(kbX, kbY, kbWidth, Math.max(3, kbHeight * 0.04));
          }

          // White keys
          for (let i = 0; i < whiteKeys.length; i++) {
            const key = whiteKeys[i];
            const isKeyActive = activeSet.has(key.midi);
            const kx = kbX + i * keyW;

            if (isKeyActive) {
              ctx.fillStyle = effectiveColor;
              ctx.fillRect(kx, kbY, keyW, kbHeight);
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(kx, kbY, keyW, kbHeight);
            }

            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(kx + keyW, kbY);
            ctx.lineTo(kx + keyW, kbY + kbHeight);
            ctx.stroke();

            if (showNoteNames) {
              ctx.save();
              ctx.font = `bold 11px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillStyle = isKeyActive ? '#09090b' : '#71717a';
              ctx.fillText(key.name, kx + keyW / 2, kbY + kbHeight - 6);
              ctx.restore();
            }
          }

          // Black keys
          const bW = keyW * 0.63;
          const bH = kbHeight * 0.62;
          for (let b = 0; b < blackKeys.length; b++) {
            const key = blackKeys[b];
            const isKeyActive = activeSet.has(key.midi);
            const seamX = kbX + (key.whiteIndex / totalWhiteKeys) * kbWidth;
            const bx = seamX - bW / 2;

            if (isKeyActive) {
              ctx.fillStyle = darkerColor;
              ctx.fillRect(bx, kbY, bW, bH);
            } else {
              ctx.fillStyle = '#18181b';
              ctx.fillRect(bx, kbY, bW, bH);
            }

            if (showNoteNames) {
              ctx.save();
              ctx.font = `bold 9px system-ui, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isKeyActive ? '#09090b' : '#a1a1aa';
              ctx.fillText(key.name, bx + bW / 2, kbY + bH / 2);
              ctx.restore();
            }
          }
        }
      };

      // Determine video track source:
      let videoTracksToRecord: MediaStreamTrack[] = [];
      const needsAspectCrop = (aspectRatio === '9:16' && rawW > rawH) || (aspectRatio === '16:9' && rawW < rawH);
      const isDirectMode = recordingMode === 'direct' && !needsAspectCrop && videoElement.srcObject instanceof MediaStream;

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
