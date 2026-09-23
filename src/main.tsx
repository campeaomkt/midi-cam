import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker with auto-update only on standard web protocols (never on Tauri or file://)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !('__TAURI__' in window) &&
  !('__TAURI_INTERNALS__' in window) &&
  !window.location.protocol.startsWith('tauri') &&
  !window.location.protocol.startsWith('file')
) {
  try {
    registerSW({
      immediate: true,
      onOfflineReady() {
        console.log('[PWA] Ready to work offline');
      },
    });
  } catch (err) {
    console.warn('[PWA] Service worker registration ignored in desktop environment:', err);
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
