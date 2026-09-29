import { spawn } from 'node:child_process';

// Runs a local CLI and collects stdout/stderr. Never throws — callers check `code`.
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, opts);
    } catch (err) {
      resolve({ stdout: '', stderr: String(err.message || err), code: -1 });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ stdout, stderr: String(err.message || err), code: -1 }));
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}
