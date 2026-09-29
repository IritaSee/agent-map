import { run } from '../lib/run.mjs';

// Confirmed via `nanobot agent --help`: --message/-m, --session/-s, --workspace/-w.
export async function chatOpenclaw({ message, workspace, sessionId }) {
  const args = ['agent', '--message', message, '--no-markdown'];
  if (workspace) args.push('--workspace', workspace);
  if (sessionId) args.push('--session', sessionId);

  const { stdout, stderr, code } = await run('nanobot', args);
  if (code !== 0) throw new Error(stderr.trim() || `nanobot keluar dengan kode ${code}`);
  return { reply: stdout.trim(), sessionId: sessionId || 'cli:direct' };
}
