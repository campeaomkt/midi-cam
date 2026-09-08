import { VideoRecording } from '../types';

const DB_NAME = 'midicam_db';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecordingToStorage(recording: VideoRecording): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Store record with blob and metadata
    const record = {
      id: recording.id,
      blob: recording.blob,
      duration: recording.duration,
      timestamp: recording.timestamp,
      thumbnailUrl: recording.thumbnailUrl,
      sizeBytes: recording.sizeBytes,
      filterName: recording.filterName,
    };

    store.put(record);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Could not save recording to IndexedDB:', err);
  }
}

export async function loadRecordingsFromStorage(): Promise<VideoRecording[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const records = request.result || [];
        // Rebuild URLs from stored blobs
        const list: VideoRecording[] = records.map((r: any) => ({
          id: r.id,
          blob: r.blob,
          url: URL.createObjectURL(r.blob),
          duration: r.duration,
          timestamp: r.timestamp,
          thumbnailUrl: r.thumbnailUrl,
          sizeBytes: r.sizeBytes,
          filterName: r.filterName,
        }));
        // Sort descending by timestamp
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      request.onerror = () => {
        resolve([]);
      };
    });
  } catch (err) {
    console.warn('Could not load recordings from IndexedDB:', err);
    return [];
  }
}

export async function deleteRecordingFromStorage(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Could not delete recording from IndexedDB:', err);
  }
}
