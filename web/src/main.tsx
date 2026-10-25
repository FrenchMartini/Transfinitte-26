import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/500.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/roboto-slab/400.css';
import '@fontsource/roboto-slab/500.css';
import '@fontsource/roboto-slab/600.css';
import './styles/tokens.css';
import App from './App';
import { validateReplayData } from './loader';
import { useSimStore } from './store/sim';

// Suppress Three.js r186 internal Clock deprecation notice from R3F ecosystem
const origWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock: This module has been deprecated')) {
    return;
  }
  origWarn.apply(console, args);
};

async function loadInitialReplay(): Promise<void> {
  if (typeof window === 'undefined') return;
  const urlParams = new URLSearchParams(window.location.search);
  const requestedFile = urlParams.get('file');

  const candidates = requestedFile
    ? [requestedFile]
    : ['/results/simulation.json', '/results/replay_ceres_tug.json'];

  for (const fileToTry of candidates) {
    try {
      const resp = await fetch(fileToTry);
      if (resp.ok) {
        const json = await resp.json();
        const validation = validateReplayData(json);
        if (validation.isValid && validation.data) {
          useSimStore.getState().setReplayData(validation.data);
          return;
        }
      }
    } catch {
      // Fall through to next candidate or mock
    }
  }
}

async function bootstrap() {
  try {
    await Promise.all([
      document.fonts.load('400 13px "Open Sans"'),
      document.fonts.load('500 13px "Open Sans"'),
      document.fonts.load('600 16px "Open Sans"'),
      document.fonts.load('400 13px "Roboto Slab"'),
      document.fonts.load('500 13px "Roboto Slab"'),
      document.fonts.load('600 16px "Roboto Slab"')
    ]);
  } catch (err) {
    console.warn('Font loading fallback:', err);
  }

  await loadInitialReplay();

  const root = createRoot(document.getElementById('root')!);

  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
