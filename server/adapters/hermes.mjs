import { run } from '../lib/run.mjs';

// Confirmed via `hermes chat --help`: `-q/--query` is the non-interactive
// single-query mode, `-Q/--quiet` suppresses banner/spinner for programmatic use.
// The quiet-mode output format (and whether/where it prints a resumable
// session id) isn't pinned down here, so v1 does not attempt session
// continuity for Hermes — every message is a fresh `hermes chat` call.
export async function chatHermes({ message }) {
  const args = ['chat', '-q', message, '-Q'];
  const { stdout, stderr, code } = await run('hermes', args);
  if (code !== 0) throw new Error(stderr.trim() || `hermes keluar dengan kode ${code}`);
  return { reply: stdout.trim() };
}
