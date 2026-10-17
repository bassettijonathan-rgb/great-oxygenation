// Starts the simulation in a Web Worker made from the bundled worker code,
// so the page stays smooth while it computes. If the browser will not run a
// worker, the same server runs on the page in short slices instead.

import { createSimServer } from './server.js';
import { runValidation } from './validation.js';

/* global __WORKER_SRC__ */
const WORKER_SRC = typeof __WORKER_SRC__ === 'string' ? __WORKER_SRC__ : null;

function workerUrl() {
  if (!WORKER_SRC || typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
  try {
    return URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  } catch {
    return null;
  }
}

export function createHost(onMessage) {
  const url = workerUrl();
  let worker = null;
  let local = null;
  let heard = false; // the worker has answered at least once
  const sent = []; // messages sent before it answered, replayed if it fails

  const goLocal = () => {
    if (local) return;
    if (worker) worker.terminate();
    worker = null;
    local = createSimServer((msg) => setTimeout(() => onMessage(msg), 0));
    for (const m of sent.splice(0)) local(m);
  };

  if (url) {
    try {
      worker = new Worker(url);
      worker.onmessage = (e) => {
        heard = true;
        sent.length = 0;
        onMessage(e.data);
      };
      worker.onerror = (e) => {
        if (!heard) {
          e.preventDefault?.();
          goLocal();
        } else onMessage({ type: 'error', message: e.message || 'The simulation stopped.' });
      };
    } catch {
      worker = null;
    }
  }
  if (!worker) goLocal();

  return {
    get mode() {
      return worker ? 'worker' : 'page';
    },
    send(msg) {
      if (worker) {
        if (!heard) sent.push(msg);
        worker.postMessage(msg);
      } else local(msg);
    },
    // A separate full run of the real-Earth default for the Validation tab.
    validate(onProgress) {
      if (url && worker) {
        return new Promise((resolve, reject) => {
          let w;
          try {
            w = new Worker(url);
          } catch (err) {
            runValidation(onProgress).then(resolve, reject);
            return;
          }
          w.onmessage = (e) => {
            const m = e.data;
            if (m.type === 'validation-progress') onProgress?.(m);
            else if (m.type === 'validation') {
              w.terminate();
              resolve(m.result);
            } else if (m.type === 'error') {
              w.terminate();
              reject(new Error(m.message));
            }
          };
          w.onerror = (e) => {
            w.terminate();
            reject(new Error(e.message || 'The check stopped.'));
          };
          w.postMessage({ type: 'validate' });
        });
      }
      return runValidation(onProgress);
    },
  };
}
