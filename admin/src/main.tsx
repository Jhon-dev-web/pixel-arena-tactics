import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { ConfigMissing } from './App';
import { createBackend } from './lib/backend';
import './styles.css';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  const result = await createBackend();
  root.render(<StrictMode>{result.ok ? <App backend={result.backend} /> : <ConfigMissing />}</StrictMode>);
}

void start();
