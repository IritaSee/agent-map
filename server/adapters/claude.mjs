import { run } from '../lib/run.mjs';

// Spawns a fresh headless `claude -p` process per chat turn — an independent
// session/usage from whatever conversation is driving this server itself.
// Confirmed flags (claude --help): -p/--print, --output-format json, -r/--resume <id>.
export async function chatClaude({ message, sessionId, agentName }) {
  const prompt = agentName
    ? `Delegasikan permintaan berikut ke subagent "${agentName}" lewat Task tool, lalu laporkan hasilnya secara langsung:\n\n${message}`
    : message;

  const args = ['-p', prompt, '--output-format', 'json'];
  if (sessionId) args.push('--resume', sessionId);

  const { stdout, stderr, code } = await run('claude', args);
  if (code !== 0) throw new Error(stderr.trim() || `claude keluar dengan kode ${code}`);

  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // Exact --output-format json schema isn't pinned here; fall back to raw text.
  }
  const reply = parsed?.result ?? parsed?.response ?? parsed?.content ?? stdout.trim();
  const newSessionId = parsed?.session_id ?? parsed?.sessionId ?? sessionId;
  return { reply, sessionId: newSessionId };
}
