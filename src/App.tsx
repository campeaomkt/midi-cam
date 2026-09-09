import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CameraSettings,
  KeyboardSettings,
  FilterPreset,
  FilterType,
  MidiDevice,
  VideoRecording,
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
import { OfflineIndicator } from './components/OfflineIndicator';
import { sf2Engine } from './utils/sf2Engine';
import { loadSoundFontFromStorage } from './utils/sf2Storage';
import { timbreEngine } from './utils/timbreEngine';

export default function App() {
  // Camera Configuration State
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    facingMode: 'environment',
    resolution: '1080P',
    fps: 30,
    zoom: 1,
    gridEnabled: false,
    micEnabled: true,
    flashEnabled: false,
  });

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
  const [activeSoundFontName, setActiveSoundFontName] = useState<string>(() =>
    timbreEngine.getActiveTimbreName()
  );

  // Video Element Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleSoundFontChanged = useCallback(() => {
    if (timbreEngine.getMode() === 'custom_sf2' && sf2Engine.getIsLoaded()) {
      const preset = sf2Engine.getActivePreset();
      const sfName = sf2Engine.getSoundFontName();
      setActiveSoundFontName(preset ? `${sfName} (${preset.name})` : sfName);
    } else {
      setActiveSoundFontName(timbreEngine.getActiveTimbreName());
    }
  }, []);

  // Sync with timbre engine changes
  useEffect(() => {
    const unsub = timbreEngine.subscribe(() => {
      handleSoundFontChanged();
    });
    return unsub;
  }, [handleSoundFontChanged]);

  // Restore saved SF2 SoundFont from local device storage on app startup
  useEffect(() => {
    const restoreSavedSoundFont = async () => {
      try {
        const stored = await loadSoundFontFromStorage();
        if (stored && stored.buffer) {
          await sf2Engine.loadBuffer(stored.buffer, stored.name);
          if (stored.activePresetIndex > 0) {
            sf2Engine.selectPreset(stored.activePresetIndex);
          }
          if (timbreEngine.getMode() === 'custom_sf2') {
            const preset = sf2Engine.getActivePreset();
            setActiveSoundFontName(
              preset ? `${sf2Engine.getSoundFontName()} (${preset.name})` : sf2Engine.getSoundFontName()
            );
          }
        }
      } catch (err) {
        console.warn('Could not restore saved SoundFont from storage:', err);
      }
    };

    restoreSavedSoundFont();
  }, []);

  // Get active filter object
  const activeFilter: FilterPreset = useMemo(() => {
    return FILTER_PRESETS.find((f) => f.id === activeFilterId) || FILTER_PRESETS[0];
  }, [activeFilterId]);

  // Real-time Chord Detection from active notes
  const currentChord = useMemo(() => {
    return detectChord(activeNotes);
  }, [activeNotes]);

  // Maintain last detected chord when keys are briefly lifted
  useEffect(() => {
    if (currentChord && currentChord.isKnown) {
      setLastChordState(currentChord);
    }
  }, [currentChord]);

  // Sync synth volume & mute
  useEffect(() => {
    audioSynth.setVolume(keyboardSettings.synthVolume);
    audioSynth.setMuted(!keyboardSettings.soundEnabled);
  }, [keyboardSettings.synthVolume, keyboardSettings.soundEnabled]);

  // Setup MIDI & Sustain Listeners
  useEffect(() => {
    const unsubNoteOn = midiManager.onNoteOn((note, velocity) => {
      setActiveNotes((prev) => (prev.includes(note) ? prev : [...prev, note]));
      if (keyboardSettings.soundEnabled) {
        audioSynth.startNote(note, velocity);
      }
    });

    const unsubNoteOff = midiManager.onNoteOff((note) => {
      setActiveNotes((prev) => prev.filter((n) => n !== note));
      if (keyboardSettings.soundEnabled) {
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

  // Flip Camera between User & Environment
  const handleFlipCamera = () => {
    setCameraSettings((prev) => ({
      ...prev,
      facingMode: prev.facingMode === 'user' ? 'environment' : 'user',
    }));
  };

  // Video Recording Lifecycle
  const handleToggleRecording = () => {
    if (isRecording) {
      videoRecorder.stopRecording();
      setIsRecording(false);
      setRecordingSeconds(0);
    } else {
      if (!videoRef.current) return;

      const filterCss = getCombinedFilterStyle(activeFilter, filterAdjustments);
      const keyboardElem = document.getElementById('virtual-piano-keyboard');

      // Audio tracks from Synth & Mic
      const audioTracks: MediaStreamTrack[] = [];
      const synthDest = audioSynth.getAudioStreamDestination();
      if (synthDest && synthDest.stream.getAudioTracks().length > 0) {
        audioTracks.push(synthDest.stream.getAudioTracks()[0]);
      }

      videoRecorder.setTimeUpdateListener((secs) => {
        setRecordingSeconds(secs);
      });

      videoRecorder.setCompletionListener(async (newRec) => {
        setRecordings((prev) => [newRec, ...prev]);
        await saveRecordingToStorage(newRec);
        setIsGalleryOpen(true);
      });

      const started = videoRecorder.startRecording(
        videoRef.current,
        filterCss,
        keyboardElem,
        currentChord ? currentChord.name : null,
        audioTracks
      );

      if (started) {
        setIsRecording(true);
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

      {/* Mobile Device Container Frame (matching portrait phone in reference image) */}
      <main
        id="camera-app-frame"
        className="relative w-full h-full sm:max-w-[430px] sm:h-[92vh] sm:rounded-[44px] sm:border-[8px] sm:border-[#2d0909] sm:shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden bg-black flex flex-col justify-between select-none"
      >
        {/* Dynamic Island / Top Speaker Notch Simulation for realistic phone preview */}
        <div className="hidden sm:block absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-black rounded-full z-40 border border-white/10 pointer-events-none" />

        {/* Top Camera Status & HUD Bar */}
        <header className="relative z-30 pt-safe">
          <TopHudBar
            cameraSettings={cameraSettings}
            keyboardSettings={keyboardSettings}
            midiDevices={midiDevices}
            isMidiConnected={isMidiConnected}
            activeSoundFontName={activeSoundFontName}
            isSustainActive={isSustainActive}
            onToggleSustain={handleToggleSustain}
            onUpdateCamera={(upd) => setCameraSettings((prev) => ({ ...prev, ...upd }))}
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
            onUpdateCamera={(upd) => setCameraSettings((prev) => ({ ...prev, ...upd }))}
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
        onOpenSoundFontModal={() => setIsSoundFontOpen(true)}
        onRequestMidi={handleRequestMidi}
        onUpdateCamera={(upd) => setCameraSettings((prev) => ({ ...prev, ...upd }))}
        onUpdateKeyboard={(upd) => setKeyboardSettings((prev) => ({ ...prev, ...upd }))}
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
