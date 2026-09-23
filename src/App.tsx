import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CameraSettings,
  KeyboardSettings,
  FilterPreset,
  FilterType,
  MidiDevice,
  VideoRecording,
  WifiSyncStatus,
} from './types';
import { FILTER_PRESETS, getCombinedFilterStyle } from './utils/filterPresets';
import { detectChord } from './utils/chordDetector';
import { audioSynth } from './utils/audioSynth';
import { midiManager } from './utils/midiManager';
import { videoRecorder } from './utils/videoRecorder';
import {
  saveRecordingToStorage,
  loadRecordingsFromStorage,
  deleteRecordingFromStorage,
} from './utils/recordingStorage';
import { CameraView } from './components/CameraView';
import { TopHudBar } from './components/TopHudBar';
import { BottomControls } from './components/BottomControls';
import { TypographyPositionModal } from './components/TypographyPositionModal';
import { FilterSettingsDrawer } from './components/FilterSettingsDrawer';
import { SettingsModal } from './components/SettingsModal';
import { RecordedVideosModal } from './components/RecordedVideosModal';
import { SoundFontManagerModal } from './components/SoundFontManagerModal';
import { WifiMidiSyncModal } from './components/WifiMidiSyncModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SoundFontEngine } from './audio/SoundFontEngine';
import { wifiMidiBridge } from './utils/wifiMidiBridge';
import { useMediaDevices } from './hooks/useMediaDevices';
import { unlockAudioContext } from './utils/iosAudioUnlock';

const CAMERA_SETTINGS_STORAGE_KEY = 'piano_camera_settings_v3';

function loadStoredCameraSettings(): CameraSettings {
  const defaults: CameraSettings = {
    facingMode: 'environment',
    resolution: '1080P',
    fps: 30,
    zoom: 1,
    gridEnabled: false,
    micEnabled: true,
    flashEnabled: false,
    recordingMode: 'overlay', // Default to Overlay so keyboard, animated keys and chords are burned into the recorded video
    aspectRatio: '9:16', // Default 9:16 vertical ratio for Reels/TikTok/Shorts
    audioRecordSource: 'keyboard-and-mic', // Default to Keyboard + Mic so voice is recorded seamlessly when mic is active
    micGainLevel: 1.0, // Default 1.0 (with studio vocal preamp)
    keyboardRecordingGainLevel: 0.85, // Studio keyboard mix balance
  };
  try {
    const saved = localStorage.getItem(CAMERA_SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaults, ...parsed };
    }
  } catch {}
  return defaults;
}

export default function App() {
  const { cameras, microphones, refreshDevices } = useMediaDevices();
  const recordingAudioCleanupRef = useRef<(() => void) | null>(null);

  // Camera Configuration State persisted in localStorage
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(loadStoredCameraSettings);

  const handleUpdateCamera = useCallback((updates: Partial<CameraSettings>) => {
    setCameraSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(CAMERA_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Virtual Keyboard & Overlay Configuration (matches uploaded screenshot)
  const [keyboardSettings, setKeyboardSettings] = useState<KeyboardSettings>({
    visible: true,
    keyCount: 61, // 61 keys standard default as requested by user
    octaves: 3,
    startOctave: 2, // C2 for 61 keys (range C2 - C7)
    octaveShift: 0, // Default 0 calibrated
    heightPreset: 'normal',
    position: 'upper-third', // Positioned above camera hands view matching screenshot
    theme: 'cyan', // Neon cyan / turquoise keys matching screenshot
    customColor: '#3bf5b0',
    showNoteNames: false,
    opacity: 1,
    scale: 1,
    glowIntensity: 80, // Default 80% glow intensity
    soundEnabled: true,
    synthVolume: 0.75,
    viewMode: 'fit',
    visualModel: 'realistic-3d',
  });

  // Filter and Color Grading State
  const [activeFilterId, setActiveFilterId] = useState<FilterType>('cinematic-warm');
  const [filterAdjustments, setFilterAdjustments] = useState({
    brightness: 1,
    contrast: 1,
    saturate: 1,
    sepia: 0,
    hueRotate: 0,
  });

  // Chord Typography State
  const [chordColor, setChordColor] = useState('#ffffff');
  const [chordFontSize, setChordFontSize] = useState<'medium' | 'large' | 'huge'>('large');

  // Active Musical Notes & Chords State
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [lastChordState, setLastChordState] = useState<ReturnType<typeof detectChord>>(null);

  // MIDI Devices State
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [isMidiConnected, setIsMidiConnected] = useState<boolean>(false);
  const [isSustainActive, setIsSustainActive] = useState<boolean>(false);

  // Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordings, setRecordings] = useState<VideoRecording[]>([]);

  // Modals & Drawers State
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);
  const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isSoundFontOpen, setIsSoundFontOpen] = useState(false);
  const [isWifiSyncOpen, setIsWifiSyncOpen] = useState(false);
  const [wifiSyncStatus, setWifiSyncStatus] = useState<WifiSyncStatus>(() =>
    wifiMidiBridge.getStatus()
  );
  const [activeSoundFontName, setActiveSoundFontName] = useState<string>(() =>
    SoundFontEngine.getActiveBankName()
  );

  // Subscribe to Wi-Fi MIDI Sync Bridge
  useEffect(() => {
    const unsub = wifiMidiBridge.subscribe((status) => {
      setWifiSyncStatus(status);
    });
    return unsub;
  }, []);

  // Auto-connect if URL has ?sync=CODE (from QR Code scan on mobile)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const syncCode = params.get('sync');
      if (syncCode) {
        wifiMidiBridge.connectClient(syncCode).then((res) => {
          if (res.success) {
            setIsWifiSyncOpen(true);
          }
        });
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, []);

  // Video Element Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleSoundFontChanged = useCallback(() => {
    setActiveSoundFontName(SoundFontEngine.getActiveBankName());
  }, []);

  // Sync with SoundFontEngine changes
  useEffect(() => {
    const unsub = SoundFontEngine.subscribe(() => {
      handleSoundFontChanged();
    });
    return unsub;
  }, [handleSoundFontChanged]);

  // Get active filter object
  const activeFilter: FilterPreset = useMemo(() => {
    return FILTER_PRESETS.find((f) => f.id === activeFilterId) || FILTER_PRESETS[0];
  }, [activeFilterId]);

  // Real-time Chord Detection from active notes
  const currentChord = useMemo(() => {
    return detectChord(activeNotes);
  }, [activeNotes]);

  // Keep live references for video recorder animation loop without triggering re-renders
  const activeNotesRef = useRef<number[]>([]);
  const currentChordRef = useRef<string | null>(null);

  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);

  useEffect(() => {
    currentChordRef.current = currentChord ? currentChord.name : null;
  }, [currentChord]);

  // Maintain last detected chord when keys are briefly lifted
  useEffect(() => {
    if (currentChord && currentChord.isKnown) {
      setLastChordState(currentChord);
    }
  }, [currentChord]);

  // Keep live reference of keyboardSettings for MIDI event handlers
  const keyboardSettingsRef = useRef<KeyboardSettings>(keyboardSettings);
  useEffect(() => {
    keyboardSettingsRef.current = keyboardSettings;
  }, [keyboardSettings]);

  // Auto-detect real physical webcam if selected is missing or currently pointing to a virtual device like Iriun or OBS
  useEffect(() => {
    if (cameras.length > 0) {
      const isCurrentVirtual = cameraSettings.selectedVideoDeviceId
        ? cameras.some((c) => c.deviceId === cameraSettings.selectedVideoDeviceId && /iriun|obs|droidcam|virtual|vcam/i.test(c.label || ''))
        : false;

      if (!cameraSettings.selectedVideoDeviceId || isCurrentVirtual) {
        const physicalCam = cameras.find((c) => !/iriun|obs|droidcam|virtual|vcam/i.test(c.label || ''));
        if (physicalCam) {
          console.log('Preferring physical webcam over virtual device:', physicalCam.label);
          setCameraSettings((prev) => ({
            ...prev,
            selectedVideoDeviceId: physicalCam.deviceId,
          }));
        }
      }
    }
  }, [cameras, cameraSettings.selectedVideoDeviceId]);

  // Eagerly initialize audio context
  useEffect(() => {
    audioSynth.initContext();
  }, []);

  // Sync synth volume & mute
  useEffect(() => {
    audioSynth.setVolume(keyboardSettings.synthVolume);
    audioSynth.setMuted(!keyboardSettings.soundEnabled);
  }, [keyboardSettings.synthVolume, keyboardSettings.soundEnabled]);

  // Setup MIDI & Sustain Listeners
  useEffect(() => {
    const unsubNoteOn = midiManager.onNoteOn((note, velocity) => {
      setActiveNotes((prev) => (prev.includes(note) ? prev : [...prev, note]));
      if (keyboardSettingsRef.current.soundEnabled) {
        // Natural 1:1 hardware MIDI velocity straight from controller, identical to any standard DAW
        audioSynth.startNote(note, velocity);
      }
    });

    const unsubNoteOff = midiManager.onNoteOff((note) => {
      setActiveNotes((prev) => prev.filter((n) => n !== note));
      if (keyboardSettingsRef.current.soundEnabled) {
        audioSynth.stopNote(note);
      }
    });

    const unsubSustain = midiManager.onSustainChange((active) => {
      setIsSustainActive(active);
    });

    const unsubDevices = midiManager.onDevicesChange((devs) => {
      setMidiDevices(devs);
      setIsMidiConnected(devs.some((d) => d.state === 'connected'));
    });

    // Auto-attempt initial MIDI connection
    midiManager.requestAccess().then((res) => {
      if (res.success) {
        setMidiDevices(midiManager.getDevices());
        setIsMidiConnected(midiManager.getIsConnected());
      }
    });

    return () => {
      unsubNoteOn();
      unsubNoteOff();
      unsubSustain();
      unsubDevices();
      audioSynth.stopAllNotes();
    };
  }, [keyboardSettings.soundEnabled]);

  // Support Spacebar on desktop to press/release sustain pedal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        midiManager.setSustain(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        midiManager.setSustain(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle note play from virtual keyboard / touch
  const handleNotePlay = useCallback((midi: number) => {
    midiManager.triggerNoteOn(midi, 95);
  }, []);

  const handleNoteRelease = useCallback((midi: number) => {
    midiManager.triggerNoteOff(midi);
  }, []);

  const handleToggleSustain = useCallback(() => {
    midiManager.setSustain(!midiManager.getSustainActive());
  }, []);

  // Request MIDI Permission Manually
  const handleRequestMidi = async () => {
    const res = await midiManager.requestAccess();
    if (!res.success && res.message) {
      alert(res.message);
    }
  };

  // Flip Camera between User & Environment, or cycle cameras if multiple are present
  const handleFlipCamera = () => {
    if (cameras && cameras.length > 1) {
      const currentIndex = cameras.findIndex(
        (c) => c.deviceId === cameraSettings.selectedVideoDeviceId
      );
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextCam = cameras[nextIndex];
      setCameraSettings((prev) => ({
        ...prev,
        selectedVideoDeviceId: nextCam.deviceId,
        facingMode: prev.facingMode === 'user' ? 'environment' : 'user',
      }));
    } else {
      setCameraSettings((prev) => ({
        ...prev,
        facingMode: prev.facingMode === 'user' ? 'environment' : 'user',
      }));
    }
  };

  // Video Recording Lifecycle
  const handleToggleRecording = async () => {
    if (isRecording) {
      videoRecorder.stopRecording();
      setIsRecording(false);
      setRecordingSeconds(0);
      if (recordingAudioCleanupRef.current) {
        recordingAudioCleanupRef.current();
        recordingAudioCleanupRef.current = null;
      }
    } else {
      if (!videoRef.current) return;

      const filterCss = getCombinedFilterStyle(activeFilter, filterAdjustments);
      const keyboardElem = document.getElementById('virtual-piano-keyboard');

      // Ensure audio context is running and unlocked for perfect synchronization
      const audioCtx = audioSynth.getAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      unlockAudioContext(audioCtx);

      // Audio setup: Respect user's pre-configured choice
      // 'keyboard-only': Records 100% digital SF2 SoundFont timbre directly, mic is completely muted
      // 'keyboard-and-mic': Records SF2 SoundFont mixed with microphone
      // 'mic-only': Records only microphone
      const audioSource = cameraSettings.audioRecordSource || (cameraSettings.micEnabled ? 'keyboard-and-mic' : 'keyboard-only');
      const shouldRecordMic = (audioSource === 'keyboard-and-mic' || audioSource === 'mic-only') && cameraSettings.micEnabled;
      const shouldRecordKeyboard = audioSource !== 'mic-only';

      let micStream: MediaStream | null = null;
      if (shouldRecordMic) {
        try {
          // Standard high-quality voice capture with autoGainControl enabled
          // This ensures webcam and mobile microphones achieve healthy nominal levels
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: cameraSettings.selectedAudioDeviceId
              ? {
                  deviceId: { exact: cameraSettings.selectedAudioDeviceId },
                  autoGainControl: true,
                  noiseSuppression: true,
                  echoCancellation: true,
                }
              : {
                  autoGainControl: true,
                  noiseSuppression: true,
                  echoCancellation: true,
                },
          });
        } catch (aecErr) {
          console.warn('Tentativa com AGC falhou, tentando padrão com deviceId...', aecErr);
          try {
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: cameraSettings.selectedAudioDeviceId
                ? { deviceId: { exact: cameraSettings.selectedAudioDeviceId } }
                : true,
            });
          } catch (devErr) {
            try {
              micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (fallbackErr) {
              console.warn('Microfone indisponível para gravação:', fallbackErr);
            }
          }
        }
      }

      const micGain = shouldRecordMic ? (cameraSettings.micGainLevel !== undefined ? cameraSettings.micGainLevel : 1.0) : 0;
      const keyboardGain = shouldRecordKeyboard ? (cameraSettings.keyboardRecordingGainLevel !== undefined ? cameraSettings.keyboardRecordingGainLevel : 0.85) : 0;
      const { stream: recAudioStream, cleanup: audioCleanup } = audioSynth.getRecordingAudioStream(
        micStream,
        micGain,
        keyboardGain
      );
      recordingAudioCleanupRef.current = audioCleanup;

      const audioTracks = recAudioStream.getAudioTracks();

      videoRecorder.setTimeUpdateListener((secs) => {
        setRecordingSeconds(secs);
      });

      videoRecorder.setCompletionListener(async (newRec) => {
        if (recordingAudioCleanupRef.current) {
          recordingAudioCleanupRef.current();
          recordingAudioCleanupRef.current = null;
        }
        setRecordings((prev) => [newRec, ...prev]);
        await saveRecordingToStorage(newRec);
        setIsGalleryOpen(true);
      });

      const started = videoRecorder.startRecording({
        videoElement: videoRef.current,
        filterString: filterCss,
        keyboardElement: keyboardElem,
        getChord: () => currentChordRef.current,
        getNotes: () => activeNotesRef.current,
        audioTracks,
        recordingMode: cameraSettings.recordingMode || 'overlay',
        aspectRatio: cameraSettings.aspectRatio || '9:16',
        keyboardSettings,
        chordColor,
        chordFontSize,
        chordPlacement: keyboardSettings.chordPlacement || 'above',
      });

      if (started) {
        setIsRecording(true);
      } else {
        if (recordingAudioCleanupRef.current) {
          recordingAudioCleanupRef.current();
          recordingAudioCleanupRef.current = null;
        }
      }
    }
  };

  const handleDeleteRecording = async (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    await deleteRecordingFromStorage(id);
  };

  // Import media (video or photo) selected directly from iPhone Gallery / Photos
  const handleImportMedia = async (file: File) => {
    const url = URL.createObjectURL(file);
    let thumbnailUrl = '';
    let duration = 0;

    if (file.type.startsWith('image/')) {
      thumbnailUrl = url;
      duration = 1;
    } else if (file.type.startsWith('video/')) {
      try {
        const tempVid = document.createElement('video');
        tempVid.src = url;
        tempVid.muted = true;
        tempVid.setAttribute('playsinline', 'true');
        await new Promise((resolve) => {
          tempVid.onloadeddata = resolve;
          tempVid.onerror = resolve;
          setTimeout(resolve, 1200);
        });
        duration = Math.round(tempVid.duration || 5);
        const c = document.createElement('canvas');
        c.width = tempVid.videoWidth || 320;
        c.height = tempVid.videoHeight || 180;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVid, 0, 0, c.width, c.height);
          thumbnailUrl = c.toDataURL('image/jpeg', 0.7);
        }
      } catch {
        thumbnailUrl = '';
      }
    }

    const newRec: VideoRecording = {
      id: `gallery-${Date.now()}`,
      url,
      blob: file,
      duration,
      timestamp: Date.now(),
      thumbnailUrl,
      sizeBytes: file.size,
      filterName: file.name.slice(0, 20),
    };

    setRecordings((prev) => [newRec, ...prev]);
    await saveRecordingToStorage(newRec);
    setIsGalleryOpen(true);
  };

  // Load persistent recordings on mount
  useEffect(() => {
    loadRecordingsFromStorage().then((saved) => {
      if (saved && saved.length > 0) {
        setRecordings(saved);
      }
    });
  }, []);

  const handleResetFilterAdjustments = () => {
    setFilterAdjustments({
      brightness: 1,
      contrast: 1,
      saturate: 1,
      sepia: 0,
      hueRotate: 0,
    });
  };

  return (
    <div className="relative w-full h-[100dvh] bg-neutral-950 flex items-center justify-center overflow-hidden font-sans">
      {/* Offline Status Badge for PWA */}
      <OfflineIndicator />

      {/* Native Full-Screen App Container across Mobile, Tablet and Desktop */}
      <main
        id="camera-app-frame"
        className="relative w-full h-full overflow-hidden bg-black flex flex-col justify-between select-none"
      >
        {/* Top Camera Status & HUD Bar */}
        <header className="relative z-30 pt-safe">
          <TopHudBar
            cameraSettings={cameraSettings}
            keyboardSettings={keyboardSettings}
            midiDevices={midiDevices}
            isMidiConnected={isMidiConnected}
            activeSoundFontName={activeSoundFontName}
            isSustainActive={isSustainActive}
            wifiSyncStatus={wifiSyncStatus}
            cameras={cameras}
            onFlipCamera={handleFlipCamera}
            onOpenWifiSync={() => setIsWifiSyncOpen(true)}
            onToggleSustain={handleToggleSustain}
            onUpdateCamera={handleUpdateCamera}
            onUpdateKeyboard={(upd) => setKeyboardSettings((prev) => ({ ...prev, ...upd }))}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenTypographyModal={() => setIsTypographyOpen(true)}
            onOpenPositionModal={() => setIsTypographyOpen(true)}
            onOpenSoundFontModal={() => setIsSoundFontOpen(true)}
            onRequestMidi={handleRequestMidi}
          />
        </header>

        {/* Central Camera Viewport with Floating Virtual Keyboard & Live Chords */}
        <section className="absolute inset-0 z-10 w-full h-full">
          <CameraView
            cameraSettings={cameraSettings}
            keyboardSettings={keyboardSettings}
            activeFilter={activeFilter}
            filterAdjustments={filterAdjustments}
            activeNotes={activeNotes}
            currentChord={currentChord}
            lastChord={lastChordState}
            chordColor={chordColor}
            chordFontSize={chordFontSize}
            videoRef={videoRef}
            isSustainActive={isSustainActive}
            onNotePlay={handleNotePlay}
            onNoteRelease={handleNoteRelease}
            onUpdateKeyboard={(upd) => setKeyboardSettings((prev) => ({ ...prev, ...upd }))}
            onUpdateCamera={handleUpdateCamera}
          />
        </section>

        {/* Lower Controls */}
        <footer className="relative z-30 flex flex-col items-center pb-safe">
          {/* Camera Shutter, Zoom Selector, Filters & Flip Camera */}
          <BottomControls
            cameraSettings={cameraSettings}
            isRecording={isRecording}
            recordingTimeSeconds={recordingSeconds}
            activeFilter={activeFilter}
            availableFilters={FILTER_PRESETS}
            lastThumbnailUrl={recordings[0]?.thumbnailUrl}
            onUpdateCamera={handleUpdateCamera}
            onSelectFilter={(id) => setActiveFilterId(id)}
            onToggleRecording={handleToggleRecording}
            onFlipCamera={handleFlipCamera}
            onOpenGallery={() => setIsGalleryOpen(true)}
            onOpenFiltersDrawer={() => setIsFiltersDrawerOpen(true)}
          />
        </footer>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        cameraSettings={cameraSettings}
        keyboardSettings={keyboardSettings}
        midiDevices={midiDevices}
        isMidiConnected={isMidiConnected}
        activeSoundFontName={activeSoundFontName}
        wifiSyncStatus={wifiSyncStatus}
        cameras={cameras}
        microphones={microphones}
        onRefreshDevices={refreshDevices}
        onOpenWifiSync={() => {
          setIsSettingsOpen(false);
          setIsWifiSyncOpen(true);
        }}
        onOpenSoundFontModal={() => setIsSoundFontOpen(true)}
        onRequestMidi={handleRequestMidi}
        onUpdateCamera={handleUpdateCamera}
        onUpdateKeyboard={(upd) => setKeyboardSettings((prev) => ({ ...prev, ...upd }))}
      />

      {/* Wi-Fi MIDI Sync Modal (PC ⇄ Celular & Guia Tauri) */}
      <WifiMidiSyncModal
        isOpen={isWifiSyncOpen}
        onClose={() => setIsWifiSyncOpen(false)}
        onRequestMidi={handleRequestMidi}
      />

      {/* SoundFont 2 (.sf2) Manager Modal */}
      <SoundFontManagerModal
        isOpen={isSoundFontOpen}
        onClose={() => setIsSoundFontOpen(false)}
        onSoundFontChanged={handleSoundFontChanged}
      />

      {/* Typography & Position Modal */}
      <TypographyPositionModal
        isOpen={isTypographyOpen}
        onClose={() => setIsTypographyOpen(false)}
        keyboardSettings={keyboardSettings}
        onUpdateKeyboard={(upd) => setKeyboardSettings((prev) => ({ ...prev, ...upd }))}
        chordColor={chordColor}
        onChangeChordColor={setChordColor}
        chordFontSize={chordFontSize}
        onChangeChordFontSize={setChordFontSize}
      />

      {/* Real-time Filter Adjustments Drawer */}
      <FilterSettingsDrawer
        isOpen={isFiltersDrawerOpen}
        onClose={() => setIsFiltersDrawerOpen(false)}
        activeFilter={activeFilter}
        availableFilters={FILTER_PRESETS}
        onSelectFilter={(id) => setActiveFilterId(id)}
        adjustments={filterAdjustments}
        onUpdateAdjustments={(adj) => setFilterAdjustments((prev) => ({ ...prev, ...adj }))}
        onResetAdjustments={handleResetFilterAdjustments}
      />

      {/* Recorded Videos Gallery & Player Modal */}
      <RecordedVideosModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        recordings={recordings}
        onDeleteRecording={handleDeleteRecording}
        onImportMedia={handleImportMedia}
      />
    </div>
  );
}
