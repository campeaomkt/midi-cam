import { MidiDevice } from '../types';
import { SoundFontEngine } from '../audio/SoundFontEngine';
import { audioSynth } from './audioSynth';

export type NoteCallback = (midiNumber: number, velocity: number, isRemoteSync?: boolean) => void;
export type NoteOffCallback = (midiNumber: number, isRemoteSync?: boolean) => void;
export type DevicesCallback = (devices: MidiDevice[]) => void;
export type SustainCallback = (active: boolean) => void;

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
  private sustainListeners: Set<SustainCallback> = new Set();
  private devices: MidiDevice[] = [];
  private sustainActive: boolean = false;
  private heldKeys: Set<number> = new Set();

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

  public getSustainActive(): boolean {
    return this.sustainActive;
  }

  public setSustain(active: boolean) {
    if (this.sustainActive === active) return;
    this.sustainActive = active;
    SoundFontEngine.setSustain(active);
    audioSynth.setSustain(active);
    this.notifySustainListeners(active);
  }

  public async requestAccess(): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupported) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      return {
        success: false,
        message: isIOS
          ? 'A Apple não permite Web MIDI no Safari nem no Chrome do iOS. Para usar no iPhone/iPad, baixe o app gratuito "Web MIDI Browser" na App Store e abra o link do app por ele!'
          : 'Web MIDI API não é suportada por este navegador (recomendado: Chrome, Edge ou Brave no Android/PC/Mac).'
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
        this.handleNoteOn(note, velocity);
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
      // CC 64 = Damper/Sustain Pedal with Hysteresis (64 on / 40 off) per spec
      if (ccNumber === 64) {
        if (ccValue >= 64 && !this.sustainActive) {
          this.setSustain(true);
        } else if (ccValue <= 40 && this.sustainActive) {
          this.setSustain(false);
        }
      }
    }
  }

  public panic() {
    this.heldKeys.clear();
    this.sustainActive = false;
    SoundFontEngine.panic();
    audioSynth.stopAllNotes();
    this.notifySustainListeners(false);
  }

  private handleNoteOn(note: number, velocity: number, isRemoteSync = false) {
    this.heldKeys.add(note);
    this.notifyNoteOn(note, velocity, isRemoteSync);
  }

  private handleNoteOff(note: number, isRemoteSync = false) {
    this.heldKeys.delete(note);
    this.notifyNoteOff(note, isRemoteSync);
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

  public onSustainChange(cb: SustainCallback): () => void {
    this.sustainListeners.add(cb);
    cb(this.sustainActive);
    return () => this.sustainListeners.delete(cb);
  }

  public triggerNoteOn(note: number, velocity: number = 100, isRemoteSync = false) {
    this.handleNoteOn(note, velocity, isRemoteSync);
  }

  public triggerNoteOff(note: number, isRemoteSync = false) {
    this.handleNoteOff(note, isRemoteSync);
  }

  private notifyNoteOn(note: number, velocity: number, isRemoteSync = false) {
    this.noteOnListeners.forEach((cb) => cb(note, velocity, isRemoteSync));
  }

  private notifyNoteOff(note: number, isRemoteSync = false) {
    this.noteOffListeners.forEach((cb) => cb(note, isRemoteSync));
  }

  private notifyDevicesListeners() {
    this.devicesListeners.forEach((cb) => cb(this.devices));
  }

  private notifySustainListeners(active: boolean) {
    this.sustainListeners.forEach((cb) => {
      try {
        cb(active);
      } catch {}
    });
  }
}

export const midiManager = new MidiManager();
