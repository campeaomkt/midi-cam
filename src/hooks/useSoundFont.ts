/**
 * useSoundFont.ts
 * React hook for SoundFont management and state, ported from MIDI Cam.
 */

import { useState, useEffect, useCallback } from 'react';
import { SoundFontEngine } from '../audio/SoundFontEngine';
import { soundFontLibrary, SoundFontCatalogEntry } from '../audio/soundFontLibrary';

export function useSoundFont() {
  const [catalog, setCatalog] = useState<SoundFontCatalogEntry[]>([]);
  const [activeBankName, setActiveBankName] = useState<string>('Nenhum SoundFont Ativo');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasSoundFontLoaded, setHasSoundFontLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [volume, setVolumeState] = useState(55); // Default 55% per spec

  const syncState = useCallback(() => {
    setCatalog(soundFontLibrary.list());
    const active = soundFontLibrary.getActive();
    setActiveId(active ? active.id : null);
    setActiveBankName(SoundFontEngine.getActiveBankName());
    setIsReady(SoundFontEngine.getIsReady());
    setHasSoundFontLoaded(SoundFontEngine.isSoundFontLoaded());
    setIsLoading(SoundFontEngine.getIsLoading());
    setLoadProgress(SoundFontEngine.getLoadProgress());
    setVolumeState(Math.round(SoundFontEngine.getGain() * 100));
  }, []);

  useEffect(() => {
    syncState();
    const unsubEngine = SoundFontEngine.subscribe(syncState);
    const unsubLibrary = soundFontLibrary.subscribe(syncState);

    // Eagerly initialize soundfont engine
    SoundFontEngine.init().catch((e) => console.warn('[useSoundFont] Init warning:', e));

    return () => {
      unsubEngine();
      unsubLibrary();
    };
  }, [syncState]);

  const selectBank = useCallback(async (id: string) => {
    try {
      await SoundFontEngine.selectBank(id);
    } catch (e) {
      console.error('[useSoundFont] Error selecting bank:', e);
      throw e;
    }
  }, []);

  const importSoundFont = useCallback(async (file: File) => {
    try {
      return await SoundFontEngine.importAndLoad(file, file.name);
    } catch (e) {
      console.error('[useSoundFont] Error importing soundfont:', e);
      throw e;
    }
  }, []);

  const deleteBank = useCallback(async (id: string) => {
    try {
      await SoundFontEngine.deleteBank(id);
    } catch (e) {
      console.error('[useSoundFont] Error deleting bank:', e);
      throw e;
    }
  }, []);

  const panic = useCallback(() => {
    SoundFontEngine.panic();
  }, []);

  const setVolume = useCallback((percent: number) => {
    SoundFontEngine.setVolume(percent);
    setVolumeState(percent);
  }, []);

  return {
    isReady,
    hasSoundFontLoaded,
    isLoading,
    loadProgress,
    activeBankName,
    activeId,
    catalog,
    selectBank,
    importSoundFont,
    deleteBank,
    panic,
    volume,
    setVolume,
    refreshCatalog: syncState,
  };
}
