import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/**
 * Register the service worker so the app installs to a home screen and runs
 * offline. Only in production builds, and never fatal: contexts without a
 * service worker (dev, sandboxed frames, insecure origins) just skip it and
 * the app runs normally from the network.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(url, { scope: './' }).catch(() => {
      /* Offline support is an enhancement, not a requirement. */
    });
  });
}
