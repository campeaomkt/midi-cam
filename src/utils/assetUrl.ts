/**
 * assetUrl.ts
 * Universal asset URL resolver for Web, Tauri, Electron, and Capacitor.
 * Ensures relative and public assets resolve properly under custom schemes
 * (e.g., tauri://localhost, https://tauri.localhost, file:///, http://localhost:3000)
 */

export function resolveAssetUrl(relativePath: string): string {
  if (typeof window === 'undefined') {
    return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  }

  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

  try {
    // Correctly resolves relative to current document base in Webview2 / Tauri / Browser
    const resolved = new URL(cleanPath, window.location.href);
    return resolved.href;
  } catch {
    const base = (import.meta as any).env?.BASE_URL || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}${cleanPath}`;
  }
}
