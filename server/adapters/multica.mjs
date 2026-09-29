import { run } from '../lib/run.mjs';

// Multica's CLI has no direct "chat with an agent" command — the way to hand
// it work is to create an issue assigned to that agent. We resolve the
// workspace/agent name to a real id via `multica agent list`, falling back to
// name-based --assignee (fuzzy match) if that lookup fails.
export async function chatMultica({ message, workspace }) {
  let assigneeArgs = ['--assignee', workspace];
  const list = await run('multica', ['agent', 'list', '--output', 'json']);
  if (list.code === 0) {
    try {
      const agents = JSON.parse(list.stdout);
      const needle = workspace.toLowerCase();
      const match =
        agents.find((a) => (a.name || '').toLowerCase() === needle) ||
        agents.find((a) => (a.name || '').toLowerCase().includes(needle));
      if (match?.id) assigneeArgs = ['--assignee-id', match.id];
    } catch {
      // unexpected output shape — fall back to name-based assignee below
    }
  }

  const firstLine = message.split('\n')[0].trim();
  const title = firstLine ? firstLine.slice(0, 80) : 'Tugas dari Agent Map';

  const args = ['issue', 'create', '--title', title, '--description', message, ...assigneeArgs, '--output', 'json'];
  const { stdout, stderr, code } = await run('multica', args);
  if (code !== 0) throw new Error(stderr.trim() || `multica issue create keluar dengan kode ${code}`);

  let issue = null;
  try {
    issue = JSON.parse(stdout);
  } catch {
    issue = { raw: stdout.trim() };
  }
  const label = issue?.id || issue?.key || issue?.raw || '(lihat Multica)';
  return { reply: `Tugas dibuat: ${label}`, issue };
}
