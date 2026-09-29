#!/usr/bin/env node
// Scans local agent configs and writes public/agents.json.
// Reads names / structure only. Never reads tokens, keys or auth files.
//
// Override any path via env or agentmap.config.json:
//   HERMES_DIR, MULTICA_DIR, MULTICA_WS_DIR, OPENCLAW_DIR, CLAUDE_DIR

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();

let userCfg = {};
try {
  userCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'agentmap.config.json'), 'utf8'));
} catch { /* optional */ }

const expand = (p) => (p ? p.replace(/^~(?=$|\/)/, HOME) : p);
const P = {
  hermes: expand(process.env.HERMES_DIR || userCfg.hermes || '~/.hermes'),
  multica: expand(process.env.MULTICA_DIR || userCfg.multica || '~/.multica'),
  multicaWs: expand(process.env.MULTICA_WS_DIR || userCfg.multicaWorkspaces || '~/multica_workspaces_desktop-api.multica.ai'),
  openclaw: expand(process.env.OPENCLAW_DIR || userCfg.openclaw || '~/ai-agents/agent_setups'),
  claude: expand(process.env.CLAUDE_DIR || userCfg.claude || '~/.claude'),
};

const warnings = [];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const ls = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const mtime = (p) => { try { return fs.statSync(p).mtime.toISOString(); } catch { return undefined; } };
const daysAgo = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity);
const statusFromAge = (iso, liveDays = 2, idleDays = 45) => {
  const d = daysAgo(iso);
  return d <= liveDays ? 'live' : d <= idleDays ? 'idle' : 'planned';
};

function frontmatter(txt) {
  if (!txt) return {};
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (mm) out[mm[1]] = mm[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// --- tiny YAML helpers (top-level blocks only) ---------------------------------
function yamlBlock(txt, key) {
  const m = txt.match(new RegExp(`^${key}:\\s*\\n((?:[ \\t]+.*\\n?|\\n)*)`, 'm'));
  return m ? m[1] : '';
}
function yamlChildKeys(block, indent = 2) {
  const re = new RegExp(`^ {${indent}}([A-Za-z0-9_.-]+):`, 'gm');
  return [...block.matchAll(re)].map((m) => m[1]);
}
function yamlScalar(block, key) {
  const m = block.match(new RegExp(`^\\s+${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

// --- Hermes ---------------------------------------------------------------------
function scanHermes() {
  if (!exists(P.hermes)) return null;
  const cfg = read(path.join(P.hermes, 'config.yaml')) || '';
  const model = yamlScalar(yamlBlock(cfg, 'model'), 'default');
  const provider = yamlScalar(yamlBlock(cfg, 'model'), 'provider');
  const platforms = yamlChildKeys(yamlBlock(cfg, 'platform_toolsets'));
  const mcp = yamlChildKeys(yamlBlock(cfg, 'mcp_servers'));
  const personalities = yamlChildKeys(yamlBlock(cfg, 'personalities') || yamlBlock(yamlBlock(cfg, 'agent'), 'personalities'), 4);
  const lastActive = mtime(path.join(P.hermes, 'state.db')) || mtime(path.join(P.hermes, 'config.yaml'));

  const subs = [];
  for (const d of ls(path.join(P.hermes, 'skills'))) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    const dir = path.join(P.hermes, 'skills', d.name);
    const inner = ls(dir).filter((x) => x.isDirectory() && !x.name.startsWith('.')).length;
    subs.push({
      id: `hermes-skill-${slug(d.name)}`,
      name: d.name,
      kind: 'skill group',
      description: inner ? `${inner} skill di kategori ini` : 'Skill',
      status: 'idle',
      source: `skills/${d.name}`,
    });
  }
  for (const m of mcp) {
    subs.push({
      id: `hermes-mcp-${slug(m)}`,
      name: m,
      kind: 'MCP server',
      description: 'MCP server yang terpasang di Hermes',
      status: 'live',
      source: 'config.yaml › mcp_servers',
    });
  }
  const agents = [
    {
      id: 'hermes-main',
      name: 'Hermes',
      role: 'Agent utama (CLI / desktop / gateway)',
      model: [provider, model].filter(Boolean).join(' / ') || undefined,
      status: statusFromAge(lastActive, 3),
      updatedAt: lastActive,
      source: '~/.hermes',
      description: `Platform terhubung: ${platforms.join(', ') || '-'}.` + (personalities.length ? ` Personality: ${personalities.length}.` : ''),
      subagents: subs,
    },
  ];
  // extra profiles = extra agents
  for (const d of ls(path.join(P.hermes, 'profiles'))) {
    if (!d.isDirectory()) continue;
    agents.push({
      id: `hermes-profile-${slug(d.name)}`,
      name: `Hermes · ${d.name}`,
      role: 'Profil Hermes',
      status: statusFromAge(mtime(path.join(P.hermes, 'profiles', d.name))),
      source: `profiles/${d.name}`,
      subagents: [],
    });
  }
  return { id: 'hermes', name: 'Hermes', color: '#f5a524', kind: 'runtime', agents };
}

// --- Multica (client wrapper) ----------------------------------------------------
function scanMulticaAgents() {
  if (!exists(P.multicaWs) && !exists(P.multica)) return null;
  const agents = [];
  // one agent per workspace dir: <slug>-<hash>/
  for (const w of ls(P.multicaWs)) {
    if (!w.isDirectory() || w.name.startsWith('.')) continue;
    const wsDir = path.join(P.multicaWs, w.name);
    const runs = ls(wsDir).filter((x) => x.isDirectory());
    const groups = new Map(); // issue key (nar-32) -> runs
    for (const r of runs) {
      const m = r.name.match(/^([a-z]+-\d+)-[0-9a-f]+$/i);
      const key = m ? m[1].toUpperCase() : r.name.startsWith('task') ? 'TASK' : r.name;
      const meta = (() => { try { return JSON.parse(read(path.join(wsDir, r.name, '.gc_meta.json')) || '{}'); } catch { return {}; } })();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ name: r.name, completedAt: meta.completed_at, mtime: mtime(path.join(wsDir, r.name)) });
    }
    const subs = [...groups.entries()].map(([key, rs]) => {
      const last = rs.map((r) => r.completedAt || r.mtime).filter(Boolean).sort().pop();
      const allDone = rs.every((r) => r.completedAt);
      return {
        id: `multica-${slug(w.name)}-${slug(key)}`,
        name: key,
        kind: 'issue run',
        description: `${rs.length} run task${allDone ? ' (semua selesai)' : ''}`,
        status: allDone ? statusFromAge(last, 1, 60) : 'dev',
        updatedAt: last,
        source: `${w.name}/`,
      };
    });
    const wsName = w.name.replace(/-[a-z]-[0-9a-f]+$/i, '').replace(/-[0-9a-f]{12}$/i, '');
    const last = subs.map((s) => s.updatedAt).filter(Boolean).sort().pop();
    agents.push({
      id: `multica-ws-${slug(w.name)}`,
      name: wsName || w.name,
      role: 'Workspace Multica (menjalankan Hermes/Claude per issue)',
      status: statusFromAge(last, 3),
      updatedAt: last,
      source: `~/${path.basename(P.multicaWs)}/${w.name}`,
      description: `${runs.length} task run dari ${groups.size} issue.`,
      subagents: subs,
    });
  }
  const daemonLog = path.join(P.multica, 'profiles');
  const profiles = ls(daemonLog).filter((d) => d.isDirectory());
  for (const p of profiles) {
    const sessions = ls(path.join(daemonLog, p.name, 'hermes-sessions')).length;
    agents.push({
      id: `multica-daemon-${slug(p.name)}`,
      name: `Daemon · ${p.name}`,
      role: 'Multica daemon lokal',
      status: statusFromAge(mtime(path.join(daemonLog, p.name, 'daemon.log')), 2),
      updatedAt: mtime(path.join(daemonLog, p.name, 'daemon.log')),
      source: `~/.multica/profiles/${p.name}`,
      description: `${sessions} sesi Hermes tersimpan.`,
      subagents: [],
    });
  }
  return { id: 'multica', name: 'Multica', color: '#7c5cff', kind: 'client', agents };
}

// --- OpenClaw / nanobot ----------------------------------------------------------
function scanOpenclaw() {
  if (!exists(P.openclaw)) return null;
  const agents = [];
  for (const d of ls(path.join(P.openclaw, 'agents'))) {
    if (!d.isDirectory()) continue;
    agents.push({
      id: `openclaw-${slug(d.name)}`,
      name: d.name,
      role: 'Agent OpenClaw / nanobot',
      status: statusFromAge(mtime(path.join(P.openclaw, 'agents', d.name)), 7),
      source: `agent_setups/agents/${d.name}`,
      subagents: [],
    });
  }
  const skills = ls(path.join(P.openclaw, 'skills')).filter((s) => s.isDirectory() && !s.name.startsWith('.'));
  if (agents[0]) {
    agents[0].subagents = skills.map((s) => ({
      id: `openclaw-skill-${slug(s.name)}`,
      name: s.name,
      kind: 'skill',
      status: 'idle',
      source: `skills/${s.name}`,
    }));
  }
  if (!agents.length) return null;
  return { id: 'openclaw', name: 'OpenClaw', color: '#2dd4a4', kind: 'runtime', agents };
}

// --- Claude (Claude Code sub-agents) -------------------------------------------
function scanClaude() {
  if (!exists(P.claude)) {
    warnings.push(`Folder Claude tidak ditemukan/tidak diberi akses: ${P.claude} (dilewati)`);
    return null;
  }
  const subs = [];
  for (const f of ls(path.join(P.claude, 'agents'))) {
    if (!f.isFile() || !f.name.endsWith('.md')) continue;
    const txt = read(path.join(P.claude, 'agents', f.name));
    const fm = frontmatter(txt);
    subs.push({
      id: `claude-agent-${slug(fm.name || f.name)}`,
      name: fm.name || f.name.replace(/\.md$/, ''),
      kind: 'sub-agent',
      description: fm.description,
      model: fm.model,
      tools: fm.tools ? fm.tools.split(',').map((s) => s.trim()) : undefined,
      status: statusFromAge(mtime(path.join(P.claude, 'agents', f.name)), 7, 120),
      source: `agents/${f.name}`,
    });
  }
  for (const d of ls(path.join(P.claude, 'skills'))) {
    if (!d.isDirectory()) continue;
    const fm = frontmatter(read(path.join(P.claude, 'skills', d.name, 'SKILL.md')));
    subs.push({
      id: `claude-skill-${slug(d.name)}`,
      name: fm.name || d.name,
      kind: 'skill',
      description: fm.description,
      status: 'idle',
      source: `skills/${d.name}`,
    });
  }
  return {
    id: 'claude',
    name: 'Claude',
    color: '#ff7a59',
    kind: 'runtime',
    agents: [
      {
        id: 'claude-code',
        name: 'Claude Code',
        role: 'Agent coding + sub-agent',
        status: statusFromAge(mtime(P.claude), 3),
        source: '~/.claude',
        subagents: subs,
      },
    ],
  };
}

const clients = [scanMulticaAgents(), scanHermes(), scanClaude(), scanOpenclaw()].filter(Boolean);

// user-defined extras (agentmap.config.json -> "extraClients": [...]) are merged as-is
if (Array.isArray(userCfg.extraClients)) clients.push(...userCfg.extraClients);

const out = {
  title: userCfg.title || 'Agent Map',
  root: { name: userCfg.rootName || 'Command Center' },
  generatedAt: new Date().toISOString(),
  clients,
  warnings,
};

fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'agents.json'), JSON.stringify(out, null, 2));

const nAgents = clients.reduce((s, c) => s + c.agents.length, 0);
const nSubs = clients.reduce((s, c) => s + c.agents.reduce((x, a) => x + (a.subagents?.length || 0), 0), 0);
console.log(`agents.json: ${clients.length} platform, ${nAgents} agent, ${nSubs} sub-agent`);
warnings.forEach((w) => console.warn('⚠', w));
