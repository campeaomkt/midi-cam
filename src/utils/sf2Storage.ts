/**
 * IndexedDB storage for User Loaded SoundFont (.sf2) files
 * Allows the loaded timbre to persist in iPhone / Android / Desktop storage
 */

const DB_NAME = 'midicam_soundfonts_db';
const DB_VERSION = 1;
const STORE_NAME = 'soundfonts';

export interface StoredSoundFont {
  id: string;
  name: string;
  sizeBytes: number;
  buffer: ArrayBuffer;
  savedAt: number;
  activePresetIndex: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSoundFontToStorage(
  name: string,
  buffer: ArrayBuffer,
  activePresetIndex = 0
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: StoredSoundFont = {
      id: 'active-user-sf2',
      name,
      sizeBytes: buffer.byteLength,
      buffer,
      savedAt: Date.now(),
      activePresetIndex,
    };

    await new Promise<void>((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save SoundFont to IndexedDB:', err);
  }
}

export async function loadSoundFontFromStorage(): Promise<StoredSoundFont | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const req = store.get('active-user-sf2');
      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('Failed to load SoundFont from IndexedDB:', err);
    return null;
  }
}

export async function deleteSoundFontFromStorage(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const req = store.delete('active-user-sf2');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete SoundFont from IndexedDB:', err);
  }
}
