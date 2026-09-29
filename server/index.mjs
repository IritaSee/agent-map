// Local companion API for the agent chat feature. Binds to 127.0.0.1 only.
// Never reads or forwards any auth token itself — every adapter shells out to
// the target platform's own already-authenticated CLI (claude / hermes / multica / nanobot).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chatClaude } from './adapters/claude.mjs';
import { chatHermes } from './adapters/hermes.mjs';
import { chatMultica } from './adapters/multica.mjs';
import { chatOpenclaw } from './adapters/openclaw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_JSON = path.join(ROOT, 'public', 'agents.json');
const HISTORY_DIR = path.join(ROOT, '.agentmap', 'chat');
export const DEFAULT_PORT = Number(process.env.AGENTMAP_API_PORT) || 8787;

async function findNode(agentId) {
  const raw = await fs.readFile(AGENTS_JSON, 'utf8');
  const data = JSON.parse(raw);
  for (const client of data.clients || []) {
    for (const agent of client.agents || []) {
      if (agent.id === agentId) return agent;
      for (const sub of agent.subagents || []) {
        if (sub.id === agentId) return sub;
      }
    }
  }
  return null;
}

function historyPath(agentId) {
  const safe = String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(HISTORY_DIR, `${safe}.json`);
}

async function loadHistory(agentId) {
  try {
    const raw = await fs.readFile(historyPath(agentId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return { sessionId: undefined, messages: [] };
  }
}

async function saveHistory(agentId, hist) {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(historyPath(agentId), JSON.stringify(hist, null, 2));
}

async function dispatch(node, message, sessionId) {
  switch (node.runtime?.chat) {
    case 'claude-session':
      return chatClaude({ message, sessionId });
    case 'claude-subagent':
      return chatClaude({ message, sessionId, agentName: node.name });
    case 'hermes':
      return chatHermes({ message });
    case 'multica-task':
      return chatMultica({ message, workspace: node.runtime.workspace });
    case 'openclaw':
      return chatOpenclaw({ message, workspace: node.runtime.workspace, sessionId });
    default:
      throw new Error('Node ini belum mendukung chat.');
  }
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] !== 'api' || parts[1] !== 'chat' || !parts[2]) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  const agentId = decodeURIComponent(parts[2]);

  if (req.method === 'GET' && parts.length === 4 && parts[3] === 'history') {
    sendJson(res, 200, await loadHistory(agentId));
    return;
  }

  if (req.method === 'POST' && parts.length === 3) {
    const node = await findNode(agentId);
    if (!node) {
      sendJson(res, 404, { error: 'Agent tidak ditemukan di agents.json — coba npm run scan.' });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Body JSON tidak valid' });
      return;
    }
    const message = (body.message || '').trim();
    if (!message) {
      sendJson(res, 400, { error: 'Pesan kosong' });
      return;
    }

    const hist = await loadHistory(agentId);
    hist.messages.push({ role: 'user', text: message, ts: Date.now() });

    try {
      const result = await dispatch(node, message, hist.sessionId);
      hist.sessionId = result.sessionId || hist.sessionId;
      hist.messages.push({ role: 'agent', text: result.reply, ts: Date.now(), issue: result.issue });
      await saveHistory(agentId, hist);
      sendJson(res, 200, { reply: result.reply, issue: result.issue, sessionId: hist.sessionId });
    } catch (err) {
      const text = String(err?.message || err);
      hist.messages.push({ role: 'error', text, ts: Date.now() });
      await saveHistory(agentId, hist);
      sendJson(res, 502, { error: text });
    }
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => sendJson(res, 500, { error: String(err?.message || err) }));
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  createServer().listen(DEFAULT_PORT, '127.0.0.1', () => {
    console.log(`agent-map API companion di http://127.0.0.1:${DEFAULT_PORT}`);
  });
}
