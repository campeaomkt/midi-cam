/**
 * SoundFontEngine.ts
 * Cross-platform entry point for the SoundFont engine facade.
 * On Web / Electron, forwards to SoundFontEngineWeb.
 */

export * from './SoundFontEngine.web';
export { SoundFontEngine } from './SoundFontEngine.web';
export { soundFontLibrary } from './soundFontLibrary';
export type { SoundFontCatalogEntry } from './soundFontLibrary';
