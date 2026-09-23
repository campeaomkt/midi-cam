/**
 * soundFontLibrary.ts
 * SoundFont bank catalog & storage (IndexedDB for raw binary .sf2 bytes, localStorage for metadata)
 * Matched with MIDI Cam specification.
 */

export interface SoundFontCatalogEntry {
  id: string;
  name: string;
  sizeBytes: number;
  importedAt: number;
  isBuiltin?: boolean;
  presetCount?: number;
}

const STORAGE_CATALOG_KEY = 'midicam_soundfont_catalog_v2';
const STORAGE_ACTIVE_KEY = 'midicam_soundfont_active_id_v2';
const IDB_NAME = 'midicam_soundfonts_v2';
const IDB_STORE_NAME = 'sf2_binaries';
const IDB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class SoundFontLibrary {
  private catalog: SoundFontCatalogEntry[] = [];
  private activeId: string | null = null;
  private listeners: Array<() => void> = [];
  private inMemoryBuffers = new Map<string, ArrayBuffer>();

  constructor() {
    this.loadCatalog();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private loadCatalog() {
    try {
      const saved = localStorage.getItem(STORAGE_CATALOG_KEY);
      if (saved) {
        this.catalog = JSON.parse(saved);
      } else {
        this.catalog = [];
      }
      this.activeId = localStorage.getItem(STORAGE_ACTIVE_KEY);
    } catch (e) {
      console.warn('Failed to parse soundfont catalog from localStorage:', e);
      this.catalog = [];
      this.activeId = null;
    }
  }

  private saveCatalog() {
    try {
      localStorage.setItem(STORAGE_CATALOG_KEY, JSON.stringify(this.catalog));
      if (this.activeId) {
        localStorage.setItem(STORAGE_ACTIVE_KEY, this.activeId);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_KEY);
      }
    } catch (e) {
      console.warn('Failed to persist soundfont catalog to localStorage:', e);
    }
    this.notify();
  }

  public list(): SoundFontCatalogEntry[] {
    return [...this.catalog];
  }

  public getActive(): SoundFontCatalogEntry | null {
    if (!this.activeId) {
      return this.catalog[0] || null;
    }
    return this.catalog.find((c) => c.id === this.activeId) || this.catalog[0] || null;
  }

  public async setActive(id: string): Promise<void> {
    const entry = this.catalog.find((c) => c.id === id);
    if (!entry) {
      throw new Error(`SoundFont bank with id ${id} not found.`);
    }
    this.activeId = id;
    this.saveCatalog();
  }

  public async importSoundFont(
    data: ArrayBuffer | Uint8Array | File,
    fileName: string
  ): Promise<SoundFontCatalogEntry> {
    let buffer: ArrayBuffer;
    if (data instanceof File) {
      buffer = await data.arrayBuffer();
    } else if (data instanceof Uint8Array) {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
      buffer = data;
    }

    if (buffer.byteLength < 16) {
      throw new Error('Arquivo SF2 corrompido ou muito pequeno.');
    }

    // Verify RIFF / sfbk header
    const view = new DataView(buffer);
    const tag1 = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (tag1 !== 'RIFF') {
      throw new Error('O arquivo selecionado não possui assinatura RIFF válida de SoundFont.');
    }

    const cleanName = fileName.replace(/\.[^/.]+$/, '').trim() || 'SoundFont';
    const id = `sf2_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const entry: SoundFontCatalogEntry = {
      id,
      name: cleanName,
      sizeBytes: buffer.byteLength,
      importedAt: Date.now(),
    };

    // Cache immediately in memory so playback is instant without disk read delay
    this.inMemoryBuffers.set(id, buffer);

    // Save binary to IndexedDB in background / resiliently
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.put({ id, buffer });
        req.onsuccess = () => resolve();
        req.onerror = () => {
          console.warn('[SoundFontLibrary] IndexedDB put error (file remains in memory cache):', req.error);
          resolve(); // Don't reject, keep working from memory
        };
      });
    } catch (e) {
      console.warn('[SoundFontLibrary] Could not persist to IndexedDB (kept in memory cache):', e);
    }

    this.catalog.unshift(entry);
    this.activeId = id;
    this.saveCatalog();

    return entry;
  }

  public async readBytes(id: string): Promise<ArrayBuffer | null> {
    // 1. Check in-memory cache first (fastest, prevents IDB serialization bottlenecks)
    if (this.inMemoryBuffers.has(id)) {
      return this.inMemoryBuffers.get(id)!;
    }

    try {
      const db = await openDB();
      const buffer = await new Promise<ArrayBuffer | null>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result && req.result.buffer) {
            resolve(req.result.buffer);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });

      if (buffer) {
        this.inMemoryBuffers.set(id, buffer);
      }
      return buffer;
    } catch (e) {
      console.warn('Error reading SoundFont bytes from IndexedDB:', e);
      return null;
    }
  }

  public async getActiveBytes(): Promise<ArrayBuffer | null> {
    const active = this.getActive();
    if (!active) return null;
    return this.readBytes(active.id);
  }

  public async deleteSoundFont(id: string): Promise<void> {
    this.inMemoryBuffers.delete(id);

    try {
      const db = await openDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('Error deleting from IndexedDB:', e);
    }

    this.catalog = this.catalog.filter((c) => c.id !== id);
    if (this.activeId === id) {
      this.activeId = this.catalog[0]?.id || null;
    }
    this.saveCatalog();
  }
}

export const soundFontLibrary = new SoundFontLibrary();
