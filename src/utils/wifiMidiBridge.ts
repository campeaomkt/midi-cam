import { Peer, DataConnection } from 'peerjs';
import { midiManager } from './midiManager';
import { WifiSyncMode, WifiSyncStatus } from '../types';

export type WifiSyncMessage =
  | { type: 'noteOn'; note: number; velocity: number; timestamp?: number }
  | { type: 'noteOff'; note: number; timestamp?: number }
  | { type: 'sustain'; active: boolean; timestamp?: number }
  | { type: 'ping'; time: number }
  | { type: 'pong'; time: number }
  | { type: 'deviceInfo'; name: string; devices?: string[] };

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
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
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
    const unbindNoteOn = midiManager.onNoteOn((note, velocity) => {
      this.lastActiveTimestamp = Date.now();
      this.broadcastMessage({
        type: 'noteOn',
        note,
        velocity,
        timestamp: Date.now(),
      });
    });

    // Broadcast Note Off
    const unbindNoteOff = midiManager.onNoteOff((note) => {
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
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        });

        this.peer = peer;

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
              midiManager.triggerNoteOn(msg.note, msg.velocity);
            } else if (msg.type === 'noteOff') {
              midiManager.triggerNoteOff(msg.note);
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

  public disconnect() {
    this.stopPingLoop();

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
