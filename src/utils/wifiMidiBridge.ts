import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { midiManager } from './midiManager';
import { WifiSyncMode, WifiSyncStatus } from '../types';
import { findUltraWideCamera, findMainBackCamera, applyHardwareZoom } from './cameraLenses';

export type WifiSyncMessage =
  | { type: 'noteOn'; note: number; velocity: number; timestamp?: number }
  | { type: 'noteOff'; note: number; timestamp?: number }
  | { type: 'sustain'; active: boolean; timestamp?: number }
  | { type: 'ping'; time: number }
  | { type: 'pong'; time: number }
  | { type: 'deviceInfo'; name: string; devices?: string[] }
  | { type: 'cameraStreamState'; isStreaming: boolean; facingMode?: string; resolution?: string; isUltraWide?: boolean }
  | { type: 'requestStartCamera'; facingMode?: 'environment' | 'user'; resolution?: '1080P' | '720P'; targetZoom?: number }
  | { type: 'requestStopCamera' }
  | { type: 'setRemoteZoom'; zoom: number }
  | { type: 'requestSwitchLens'; lens: 'ultra-wide' | 'main' };

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export type WifiSyncListener = (status: WifiSyncStatus) => void;

class WifiMidiBridge {
  private mode: WifiSyncMode = 'idle';
  private peer: Peer | null = null;
  private roomCode: string | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private activeClientConnection: DataConnection | null = null;
  private isConnecting: boolean = false;
  private latencyMs: number | null = null;
  private error: string | null = null;
  private hostDeviceName: string = 'PC MIDI Host';
  private pingInterval: number | null = null;
  private listeners: Set<WifiSyncListener> = new Set();
  private unbindMidiListeners: (() => void)[] = [];
  private lastActiveTimestamp: number = Date.now();

  // Mobile Camera / Iriun Webcam over Wi-Fi
  private localCameraStream: MediaStream | null = null;
  private remoteCameraStream: MediaStream | null = null;
  private activeMediaCall: MediaConnection | null = null;
  private isStreamingCameraFlag: boolean = false;
  private remoteStreamListeners: Set<(stream: MediaStream | null) => void> = new Set();
  private localStreamListeners: Set<(stream: MediaStream | null) => void> = new Set();

  constructor() {
    // If URL has ?sync=CODE parameter on load, we will expose a helper to auto-connect
  }

  public getStatus(): WifiSyncStatus {
    return {
      mode: this.mode,
      roomCode: this.roomCode,
      isConnected:
        this.mode === 'host'
          ? this.connections.size > 0
          : this.mode === 'client'
          ? !!this.activeClientConnection && this.activeClientConnection.open
          : false,
      isConnecting: this.isConnecting,
      peerCount: this.mode === 'host' ? this.connections.size : this.activeClientConnection?.open ? 1 : 0,
      hostDeviceName: this.hostDeviceName,
      latencyMs: this.latencyMs,
      error: this.error,
      lastActiveTimestamp: this.lastActiveTimestamp,
      isStreamingCamera: this.isStreamingCameraFlag,
      hasRemoteCameraStream: !!this.remoteCameraStream,
      isUsingRemoteCamera: !!this.remoteCameraStream,
    };
  }

  public subscribe(listener: WifiSyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((l) => {
      try {
        l(status);
      } catch (err) {
        console.error('Error notifying wifi listener', err);
      }
    });
  }

  private formatPeerId(code: string): string {
    const clean = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `midicam-v1-${clean}`;
  }

  private generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * INICIAR COMO TRANSMISSOR (Modo PC / Host)
   * Escuta os instrumentos MIDI conectados no PC e transmite em tempo real via Wi-Fi
   */
  public async startHost(customCode?: string): Promise<{ success: boolean; code?: string; error?: string }> {
    this.disconnect();
    this.mode = 'host';
    this.isConnecting = true;
    this.error = null;
    const code = (customCode || this.generateRoomCode()).toUpperCase().trim();
    this.roomCode = code;
    this.notify();

    // Auto-request local Web MIDI if on PC
    try {
      await midiManager.requestAccess();
    } catch {
      // It's ok if user grants later
    }

    const peerId = this.formatPeerId(code);

    return new Promise((resolve) => {
      try {
        const peer = new Peer(peerId, {
          debug: 0,
          config: {
            iceServers: ICE_SERVERS,
          },
        });

        this.peer = peer;

        peer.on('open', () => {
          this.isConnecting = false;
          this.bindMidiBroadcasting();
          this.notify();
          resolve({ success: true, code });
        });

        peer.on('connection', (conn) => {
          this.handleIncomingClientConnection(conn);
        });

        peer.on('call', (call) => {
          this.handleIncomingMediaCall(call);
        });

        peer.on('error', (err) => {
          console.warn('[WiFi MIDI Host Error]', err);
          this.isConnecting = false;
          if (err.type === 'unavailable-id') {
            this.error = 'Código de sala já em uso. Gerando outro código...';
            this.notify();
            // Retry with another code
            setTimeout(() => {
              this.startHost();
            }, 500);
          } else {
            this.error = err.message || 'Erro ao iniciar servidor Wi-Fi';
            this.notify();
          }
          resolve({ success: false, error: this.error });
        });

        peer.on('disconnected', () => {
          if (this.peer && !this.peer.destroyed) {
            this.peer.reconnect();
          }
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao inicializar PeerJS';
        this.error = msg;
        this.isConnecting = false;
        this.notify();
        resolve({ success: false, error: msg });
      }
    });
  }

  private handleIncomingClientConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.lastActiveTimestamp = Date.now();

      // Send greeting & connected devices info
      const devList = midiManager.getDevices().map((d) => d.name);
      const hostPlatform = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
        ? 'PC Windows'
        : typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh')
        ? 'Mac'
        : 'Computador';

      const greeting: WifiSyncMessage = {
        type: 'deviceInfo',
        name: `${hostPlatform} (MIDI-Cam)`,
        devices: devList.length > 0 ? devList : ['Teclado / DAW MIDI'],
      };
      conn.send(greeting);

      this.notify();
    });

    conn.on('data', (raw: unknown) => {
      this.lastActiveTimestamp = Date.now();
      const msg = raw as WifiSyncMessage;
      if (msg && msg.type === 'ping') {
        conn.send({ type: 'pong', time: msg.time });
      } else if (msg && msg.type === 'cameraStreamState') {
        if (!msg.isStreaming && this.remoteCameraStream) {
          this.remoteCameraStream = null;
          this.notifyRemoteStream(null);
          this.notify();
        }
      } else if (msg && msg.type === 'requestStartCamera') {
        this.startCameraStream(msg.facingMode || 'environment', msg.resolution || '1080P', msg.targetZoom);
      } else if (msg && msg.type === 'requestStopCamera') {
        this.stopCameraStream();
      } else if (msg && msg.type === 'setRemoteZoom') {
        if (this.isStreamingCameraFlag) {
          if (msg.zoom === 0.5) {
            this.switchLens('ultra-wide');
          } else {
            this.switchLens('main');
            applyHardwareZoom(this.localCameraStream?.getVideoTracks()[0], msg.zoom);
          }
        }
      } else if (msg && msg.type === 'requestSwitchLens') {
        if (this.isStreamingCameraFlag) {
          this.switchLens(msg.lens);
        }
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.notify();
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
      this.notify();
    });
  }

  private bindMidiBroadcasting() {
    this.unbindMidiListeners.forEach((fn) => fn());
    this.unbindMidiListeners = [];

    // Broadcast Note On
    const unbindNoteOn = midiManager.onNoteOn((note, velocity, isRemoteSync) => {
      if (isRemoteSync) return; // Never bounce back notes received over Wi-Fi
      this.lastActiveTimestamp = Date.now();
      this.broadcastMessage({
        type: 'noteOn',
        note,
        velocity,
        timestamp: Date.now(),
      });
    });

    // Broadcast Note Off
    const unbindNoteOff = midiManager.onNoteOff((note, isRemoteSync) => {
      if (isRemoteSync) return;
      this.lastActiveTimestamp = Date.now();
      this.broadcastMessage({
        type: 'noteOff',
        note,
        timestamp: Date.now(),
      });
    });

    // Broadcast Sustain
    const unbindSustain = midiManager.onSustainChange((active) => {
      this.lastActiveTimestamp = Date.now();
      this.broadcastMessage({
        type: 'sustain',
        active,
        timestamp: Date.now(),
      });
    });

    this.unbindMidiListeners.push(unbindNoteOn, unbindNoteOff, unbindSustain);
  }

  public broadcastMessage(msg: WifiSyncMessage) {
    if (this.mode !== 'host' || this.connections.size === 0) return;
    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch (err) {
          console.error('Error broadcasting MIDI message to peer', err);
        }
      }
    });
  }

  /**
   * CONECTAR COMO RECEPTOR (Modo Celular / Gravação)
   * Recebe as notas tocadas no PC via Wi-Fi e acende o teclado/chords do celular
   */
  public async connectClient(code: string): Promise<{ success: boolean; error?: string }> {
    const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode) {
      return { success: false, error: 'Por favor, digite o código de pareamento do PC.' };
    }

    this.disconnect();
    this.mode = 'client';
    this.roomCode = cleanCode;
    this.isConnecting = true;
    this.error = null;
    this.latencyMs = null;
    this.notify();

    const hostPeerId = this.formatPeerId(cleanCode);

    return new Promise((resolve) => {
      try {
        const peer = new Peer({
          debug: 0,
          config: {
            iceServers: ICE_SERVERS,
          },
        });

        this.peer = peer;

        peer.on('call', (call) => {
          this.handleIncomingMediaCall(call);
        });

        peer.on('open', () => {
          const conn = peer.connect(hostPeerId, {
            reliable: false, // Low latency UDP-like channel for notes
          });
          this.activeClientConnection = conn;

          conn.on('open', () => {
            this.isConnecting = false;
            this.error = null;
            this.notify();

            // Start latency monitoring ping
            this.startPingLoop();

            resolve({ success: true });
          });

          conn.on('data', (raw: unknown) => {
            this.lastActiveTimestamp = Date.now();
            const msg = raw as WifiSyncMessage;
            if (!msg) return;

            if (msg.type === 'noteOn') {
              midiManager.triggerNoteOn(msg.note, msg.velocity, true);
            } else if (msg.type === 'noteOff') {
              midiManager.triggerNoteOff(msg.note, true);
            } else if (msg.type === 'sustain') {
              midiManager.setSustain(msg.active);
            } else if (msg.type === 'pong') {
              const rtt = Date.now() - msg.time;
              this.latencyMs = Math.max(1, Math.round(rtt / 2)); // One-way approximation
              this.notify();
            } else if (msg.type === 'deviceInfo') {
              if (msg.name) {
                this.hostDeviceName = msg.name;
              }
              this.notify();
            } else if (msg.type === 'cameraStreamState') {
              if (!msg.isStreaming && this.remoteCameraStream) {
                this.remoteCameraStream = null;
                this.notifyRemoteStream(null);
                this.notify();
              }
            } else if (msg.type === 'requestStartCamera') {
              this.startCameraStream(msg.facingMode || 'environment', msg.resolution || '1080P', msg.targetZoom);
            } else if (msg.type === 'requestStopCamera') {
              this.stopCameraStream();
            } else if (msg.type === 'setRemoteZoom') {
              if (this.isStreamingCameraFlag) {
                if (msg.zoom === 0.5) {
                  this.switchLens('ultra-wide');
                } else {
                  this.switchLens('main');
                  applyHardwareZoom(this.localCameraStream?.getVideoTracks()[0], msg.zoom);
                }
              }
            } else if (msg.type === 'requestSwitchLens') {
              if (this.isStreamingCameraFlag) {
                this.switchLens(msg.lens);
              }
            }
          });

          conn.on('close', () => {
            this.error = 'Conexão com o PC encerrada.';
            this.stopPingLoop();
            this.notify();
          });

          conn.on('error', (err) => {
            console.warn('[WiFi Client Conn Error]', err);
            this.error = 'Erro na conexão direta com o PC.';
            this.notify();
          });
        });

        peer.on('error', (err) => {
          console.warn('[WiFi Client Peer Error]', err);
          this.isConnecting = false;
          if (err.type === 'peer-unavailable') {
            this.error = `O PC com o código "${cleanCode}" não foi encontrado. Verifique se o app está aberto no computador e no mesmo Wi-Fi.`;
          } else {
            this.error = err.message || 'Erro ao conectar ao PC via Wi-Fi';
          }
          this.notify();
          resolve({ success: false, error: this.error });
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao conectar via Wi-Fi';
        this.error = msg;
        this.isConnecting = false;
        this.notify();
        resolve({ success: false, error: msg });
      }
    });
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = window.setInterval(() => {
      if (this.activeClientConnection && this.activeClientConnection.open) {
        this.activeClientConnection.send({ type: 'ping', time: Date.now() });
      }
    }, 2500);
    // Send immediate first ping
    if (this.activeClientConnection && this.activeClientConnection.open) {
      this.activeClientConnection.send({ type: 'ping', time: Date.now() });
    }
  }

  private stopPingLoop() {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleIncomingMediaCall(call: MediaConnection) {
    console.log('[WiFi Bridge] Incoming camera stream call from peer:', call.peer);
    this.activeMediaCall = call;

    const onStreamReady = (remoteStream: MediaStream) => {
      console.log('[WiFi Bridge] Remote camera stream received! Tracks:', remoteStream.getTracks().length);
      // Ensure any audio track on the remote camera feed is disabled and stopped so it never interferes with PC audio
      remoteStream.getAudioTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {}
      });
      remoteStream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      this.remoteCameraStream = remoteStream;
      this.notifyRemoteStream(remoteStream);
      this.notify();
    };

    call.on('stream', (remoteStream: MediaStream) => {
      onStreamReady(remoteStream);
    });

    // Native RTCPeerConnection fallback for cross-browser safety (Chrome/Safari/Firefox)
    try {
      // @ts-ignore
      const pc: RTCPeerConnection = call.peerConnection;
      if (pc) {
        pc.ontrack = (event: RTCTrackEvent) => {
          if (event.track.kind === 'audio') {
            try {
              event.track.stop();
            } catch {}
            return;
          }
          console.log('[WiFi Bridge] RTCPeerConnection ontrack event:', event.track.kind);
          const s = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
          onStreamReady(s);
        };
      }
    } catch (e) {
      console.warn('[WiFi Bridge] Error setting ontrack fallback:', e);
    }

    call.on('close', () => {
      console.log('[WiFi Bridge] Remote camera call ended');
      if (this.remoteCameraStream) {
        this.remoteCameraStream = null;
        this.notifyRemoteStream(null);
        this.notify();
      }
    });

    call.on('error', (err: unknown) => {
      console.warn('[WiFi Bridge] Remote camera call error:', err);
    });

    // Answer call (we act as the receiver of the mobile video feed)
    try {
      call.answer();
    } catch (e) {
      console.warn('[WiFi Bridge] Error answering media call:', e);
    }
  }

  /**
   * INICIAR TRANSMISSÃO DA CÂMERA DO CELULAR PARA O PC (Modo Iriun Webcam)
   * Captura a câmera do celular em tempo real e transmite via WebRTC P2P para o PC
   * Notifica a interface local do celular para continuar exibindo o vídeo sem tela preta
   */
  public async startCameraStream(
    facingMode: 'environment' | 'user' = 'environment',
    resolution: '1080P' | '720P' = '1080P',
    targetZoom?: number
  ): Promise<{ success: boolean; stream?: MediaStream; error?: string }> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { success: false, error: 'Câmera não suportada neste dispositivo.' };
    }

    if (!this.peer || this.peer.destroyed) {
      return { success: false, error: 'Conexão Wi-Fi não está ativa. Inicie ou conecte a uma sala primeiro.' };
    }

    this.stopCameraStream();

    try {
      const widthIdeal = resolution === '720P' ? 1280 : 1920;
      const heightIdeal = resolution === '720P' ? 720 : 1080;

      let stream: MediaStream | null = null;

      // Se o zoom solicitado for 0.5x, tenta selecionar a câmera Ultra-Wide nativa do iPhone / Android
      let ultraWideDeviceId: string | null = null;
      if (targetZoom === 0.5 && facingMode === 'environment') {
        const ultra = await findUltraWideCamera();
        if (ultra) {
          ultraWideDeviceId = ultra.deviceId;
          console.log('[WiFi Camera] Using native Ultra Wide camera:', ultra.label);
        }
      }

      // 1. Try High-resolution 60fps with ultra-wide if selected
      try {
        const videoConstraints: MediaTrackConstraints = ultraWideDeviceId
          ? {
              deviceId: { exact: ultraWideDeviceId },
              width: { ideal: widthIdeal },
              height: { ideal: heightIdeal },
              frameRate: { ideal: 60, max: 60 },
            }
          : {
              facingMode: { ideal: facingMode },
              width: { ideal: widthIdeal },
              height: { ideal: heightIdeal },
              frameRate: { ideal: 60, max: 60 },
            };

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch (e1) {
        console.warn('[WiFi Camera] 60fps failed, falling back to 30fps', e1);
        // 2. Try High-resolution 30fps
        try {
          const videoConstraints: MediaTrackConstraints = ultraWideDeviceId
            ? {
                deviceId: { ideal: ultraWideDeviceId },
                width: { ideal: widthIdeal },
                height: { ideal: heightIdeal },
                frameRate: { ideal: 30 },
              }
            : {
                facingMode: { ideal: facingMode },
                width: { ideal: widthIdeal },
                height: { ideal: heightIdeal },
                frameRate: { ideal: 30 },
              };

          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch (e2) {
          console.warn('[WiFi Camera] 30fps failed, falling back to facingMode', e2);
          // 3. Fallback to basic facingMode
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode },
              audio: false,
            });
          } catch (e3) {
            console.warn('[WiFi Camera] basic facingMode failed, falling back to video: true', e3);
            // 4. Ultimate fallback: any available video
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      if (!stream) {
        return { success: false, error: 'Não foi possível capturar a câmera.' };
      }

      this.localCameraStream = stream;
      this.isStreamingCameraFlag = true;

      // NOTIFICA A TELA DO CELULAR PARA MANTER A IMAGEM ATIVA E NÃO SUMIR!
      this.notifyLocalStream(stream);

      // Handle user stopping stream in browser/system UI
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          this.stopCameraStream();
        };
      });

      // Transmit stream to connected peer(s)
      if (this.mode === 'client' && this.roomCode) {
        const hostPeerId = this.formatPeerId(this.roomCode);
        const call = this.peer.call(hostPeerId, stream);
        this.activeMediaCall = call;
        call.on('error', (err) => console.warn('[WiFi Camera Call Error]', err));

        if (this.activeClientConnection && this.activeClientConnection.open) {
          this.activeClientConnection.send({
            type: 'cameraStreamState',
            isStreaming: true,
            facingMode,
            resolution,
            isUltraWide: !!ultraWideDeviceId,
          });
        }
      } else if (this.mode === 'host' && this.connections.size > 0) {
        this.connections.forEach((conn) => {
          if (this.peer) {
            const call = this.peer.call(conn.peer, stream);
            this.activeMediaCall = call;
            call.on('error', (err) => console.warn('[WiFi Camera Call Error]', err));
          }
        });
        this.broadcastMessage({
          type: 'cameraStreamState',
          isStreaming: true,
          facingMode,
          resolution,
          isUltraWide: !!ultraWideDeviceId,
        });
      }

      this.notify();
      return { success: true, stream };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao acessar a câmera do celular.';
      console.error('[WiFi Camera Start Error]', err);
      this.isStreamingCameraFlag = false;
      this.notifyLocalStream(null);
      this.notify();
      return { success: false, error: msg };
    }
  }

  /**
   * Alterna a lente da câmera ativa (Ultra Wide 0.5x vs Principal 1x)
   * Substitui a faixa de vídeo (replaceTrack) em tempo real no WebRTC sem desconectar o PC
   * e atualiza o preview no celular instantaneamente
   */
  public async switchLens(lens: 'ultra-wide' | 'main'): Promise<boolean> {
    if (!this.localCameraStream) {
      return false;
    }

    try {
      let targetDeviceId: string | null = null;
      if (lens === 'ultra-wide') {
        const ultra = await findUltraWideCamera();
        if (ultra) {
          targetDeviceId = ultra.deviceId;
          console.log('[WiFi Bridge] Switching lens to native Ultra Wide:', ultra.label);
        }
      } else {
        const main = await findMainBackCamera();
        if (main) {
          targetDeviceId = main.deviceId;
          console.log('[WiFi Bridge] Switching lens to Main camera:', main.label);
        }
      }

      const constraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? {
              deviceId: { exact: targetDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 60 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return false;

      // Substitui no WebRTC em andamento sem reconectar
      if (this.activeMediaCall && (this.activeMediaCall as any).peerConnection) {
        const pc: RTCPeerConnection = (this.activeMediaCall as any).peerConnection;
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newTrack);
        }
      }

      // Para as faixas da câmera anterior
      this.localCameraStream.getVideoTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });

      this.localCameraStream = newStream;
      this.notifyLocalStream(newStream);

      // Notifica o outro dispositivo
      const msg: WifiSyncMessage = {
        type: 'cameraStreamState',
        isStreaming: true,
        facingMode: 'environment',
        isUltraWide: lens === 'ultra-wide',
      };
      if (this.mode === 'client' && this.activeClientConnection) {
        this.activeClientConnection.send(msg);
      } else if (this.mode === 'host') {
        this.broadcastMessage(msg);
      }

      this.notify();
      return true;
    } catch (err) {
      console.warn('[WiFi Bridge] Erro ao alternar lente:', err);
      return false;
    }
  }

  /**
   * Envia comando de zoom/lente para a câmera remota (ex: PC clicando 0,5 ou 1x)
   */
  public requestRemoteZoom(zoom: number) {
    const msg: WifiSyncMessage = { type: 'setRemoteZoom', zoom };
    if (this.mode === 'host') {
      this.broadcastMessage(msg);
    } else if (this.mode === 'client' && this.activeClientConnection) {
      this.activeClientConnection.send(msg);
    }
  }

  /**
   * Envia comando para o outro dispositivo iniciar a câmera e transmitir
   */
  public requestRemoteStartCamera(
    facingMode: 'environment' | 'user' = 'environment',
    resolution: '1080P' | '720P' = '1080P',
    targetZoom?: number
  ) {
    const msg: WifiSyncMessage = {
      type: 'requestStartCamera',
      facingMode,
      resolution,
      targetZoom,
    };
    if (this.mode === 'host') {
      this.broadcastMessage(msg);
    } else if (this.mode === 'client' && this.activeClientConnection) {
      this.activeClientConnection.send(msg);
    }
  }

  /**
   * Envia comando para o outro dispositivo parar a transmissão da câmera
   */
  public requestRemoteStopCamera() {
    const msg: WifiSyncMessage = { type: 'requestStopCamera' };
    if (this.mode === 'host') {
      this.broadcastMessage(msg);
    } else if (this.mode === 'client' && this.activeClientConnection) {
      this.activeClientConnection.send(msg);
    }
  }

  /**
   * PARAR TRANSMISSÃO DA CÂMERA DO CELULAR
   */
  public stopCameraStream() {
    if (this.localCameraStream) {
      this.localCameraStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localCameraStream = null;
      this.notifyLocalStream(null);
    }

    if (this.activeMediaCall) {
      try {
        this.activeMediaCall.close();
      } catch {}
      this.activeMediaCall = null;
    }

    this.isStreamingCameraFlag = false;

    if (this.mode === 'client' && this.activeClientConnection && this.activeClientConnection.open) {
      this.activeClientConnection.send({ type: 'cameraStreamState', isStreaming: false });
    } else if (this.mode === 'host') {
      this.broadcastMessage({ type: 'cameraStreamState', isStreaming: false });
    }

    this.notify();
  }

  public getRemoteCameraStream(): MediaStream | null {
    return this.remoteCameraStream;
  }

  public getLocalCameraStream(): MediaStream | null {
    return this.localCameraStream;
  }

  public subscribeRemoteStream(listener: (stream: MediaStream | null) => void): () => void {
    this.remoteStreamListeners.add(listener);
    listener(this.remoteCameraStream);
    return () => this.remoteStreamListeners.delete(listener);
  }

  public subscribeLocalStream(listener: (stream: MediaStream | null) => void): () => void {
    this.localStreamListeners.add(listener);
    listener(this.localCameraStream);
    return () => this.localStreamListeners.delete(listener);
  }

  private notifyRemoteStream(stream: MediaStream | null) {
    this.remoteStreamListeners.forEach((l) => {
      try {
        l(stream);
      } catch (e) {
        console.error('[WiFi Bridge] Error in remote stream listener:', e);
      }
    });
  }

  private notifyLocalStream(stream: MediaStream | null) {
    this.localStreamListeners.forEach((l) => {
      try {
        l(stream);
      } catch (e) {
        console.error('[WiFi Bridge] Error in local stream listener:', e);
      }
    });
  }

  public disconnect() {
    this.stopPingLoop();
    this.stopCameraStream();

    if (this.remoteCameraStream) {
      this.remoteCameraStream = null;
      this.notifyRemoteStream(null);
    }

    this.unbindMidiListeners.forEach((fn) => fn());
    this.unbindMidiListeners = [];

    if (this.activeClientConnection) {
      try {
        this.activeClientConnection.close();
      } catch {}
      this.activeClientConnection = null;
    }

    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.connections.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.mode = 'idle';
    this.roomCode = null;
    this.isConnecting = false;
    this.latencyMs = null;
    this.error = null;
    this.notify();
  }
}

export const wifiMidiBridge = new WifiMidiBridge();
