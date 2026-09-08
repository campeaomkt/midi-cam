import { MidiDevice } from '../types';

export type NoteCallback = (midiNumber: number, velocity: number) => void;
export type NoteOffCallback = (midiNumber: number) => void;
export type DevicesCallback = (devices: MidiDevice[]) => void;

interface MIDIAccessInstance {
  inputs: Map<string, MIDIInputPort>;
  onstatechange: ((e: unknown) => void) | null;
}

interface MIDIInputPort {
  id: string;
  name?: string;
  manufacturer?: string;
  state: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
}

class MidiManager {
  private midiAccess: MIDIAccessInstance | null = null;
  private isSupported: boolean = false;
  private isConnected: boolean = false;
  private noteOnListeners: Set<NoteCallback> = new Set();
  private noteOffListeners: Set<NoteOffCallback> = new Set();
  private devicesListeners: Set<DevicesCallback> = new Set();
  private devices: MidiDevice[] = [];
  private sustainActive: boolean = false;
  private sustainedNotes: Set<number> = new Set();

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  public getIsSupported(): boolean {
    return this.isSupported;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getDevices(): MidiDevice[] {
    return this.devices;
  }

  public async requestAccess(): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupported) {
      return {
        success: false,
        message: 'Web MIDI API não é suportada por este navegador (recomendado: Chrome, Edge, Brave no Android/Desktop).'
      };
    }

    try {
      // TypeScript definition for navigator.requestMIDIAccess
      const nav = navigator as unknown as {
        requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccessInstance>;
      };

      if (!nav.requestMIDIAccess) {
        return { success: false, message: 'Navegador não possui suporte ao requestMIDIAccess.' };
      }

      this.midiAccess = await nav.requestMIDIAccess({ sysex: false });
      this.setupInputs();

      this.midiAccess.onstatechange = () => {
        this.setupInputs();
      };

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Falha ao conectar com dispositivos MIDI';
      return { success: false, message: errorMsg };
    }
  }

  private setupInputs() {
    if (!this.midiAccess) return;

    const deviceList: MidiDevice[] = [];
    let hasAnyConnected = false;

    this.midiAccess.inputs.forEach((input: MIDIInputPort) => {
      deviceList.push({
        id: input.id,
        name: input.name || 'Dispositivo MIDI',
        manufacturer: input.manufacturer || 'Genérico',
        state: input.state === 'connected' ? 'connected' : 'disconnected',
      });

      if (input.state === 'connected') {
        hasAnyConnected = true;
        // Bind midi message listener
        input.onmidimessage = (e) => this.handleMidiMessage(e.data);
      }
    });

    this.devices = deviceList;
    this.isConnected = hasAnyConnected;
    this.notifyDevicesListeners();
  }

  private handleMidiMessage(data: Uint8Array) {
    if (!data || data.length < 2) return;

    const status = data[0];
    const command = status >> 4;
    const note = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    // Command 9 = Note On (if velocity > 0) or Note Off (if velocity === 0)
    if (command === 9) {
      if (velocity > 0) {
        this.notifyNoteOn(note, velocity);
      } else {
        this.handleNoteOff(note);
      }
    }
    // Command 8 = Note Off
    else if (command === 8) {
      this.handleNoteOff(note);
    }
    // Command 11 = Control Change (CC)
    else if (command === 11) {
      const ccNumber = note;
      const ccValue = velocity;
      // CC 64 = Damper/Sustain Pedal
      if (ccNumber === 64) {
        this.sustainActive = ccValue >= 64;
        if (!this.sustainActive) {
          // Release sustained notes
          this.sustainedNotes.forEach(n => {
            this.notifyNoteOff(n);
          });
          this.sustainedNotes.clear();
        }
      }
    }
  }

  private handleNoteOff(note: number) {
    if (this.sustainActive) {
      this.sustainedNotes.add(note);
    } else {
      this.notifyNoteOff(note);
    }
  }

  public onNoteOn(cb: NoteCallback): () => void {
    this.noteOnListeners.add(cb);
    return () => this.noteOnListeners.delete(cb);
  }

  public onNoteOff(cb: NoteOffCallback): () => void {
    this.noteOffListeners.add(cb);
    return () => this.noteOffListeners.delete(cb);
  }

  public onDevicesChange(cb: DevicesCallback): () => void {
    this.devicesListeners.add(cb);
    cb(this.devices);
    return () => this.devicesListeners.delete(cb);
  }

  public triggerNoteOn(note: number, velocity: number = 100) {
    this.notifyNoteOn(note, velocity);
  }

  public triggerNoteOff(note: number) {
    this.notifyNoteOff(note);
  }

  private notifyNoteOn(note: number, velocity: number) {
    this.noteOnListeners.forEach(cb => cb(note, velocity));
  }

  private notifyNoteOff(note: number) {
    this.noteOffListeners.forEach(cb => cb(note));
  }

  private notifyDevicesListeners() {
    this.devicesListeners.forEach(cb => cb(this.devices));
  }
}

export const midiManager = new MidiManager();
