import process from 'node:process';

// One Ctrl-C handler for every loop in this process. The first press asks each running loop to
// stop (each writes its own stop request and aborts its own agent run); a second press exits.
// Loops subscribe and unsubscribe, so lanes and arenas never stack process listeners.

const loops = new Map();
let presses = 0, installed = false;

function onSigint() {
  presses += 1;
  if (presses > 1) process.exit(130);
  for (const stop of loops.values()) { try { stop(); } catch { /* a loop that cannot stop is reported by its own run */ } }
}

/** Registers a loop's stop function under `key`; returns the function that unregisters it. */
export function onInterrupt(key, stop) {
  loops.set(key, stop);
  if (!installed) { process.on('SIGINT', onSigint); installed = true; }
  return () => {
    if (loops.get(key) === stop) loops.delete(key);
    if (!loops.size && installed) { process.removeListener('SIGINT', onSigint); installed = false; presses = 0; }
  };
}

/** The loops currently listening, for tests and status. */
export const interruptible = () => [...loops.keys()];
