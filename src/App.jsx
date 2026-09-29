import React, { useEffect, useMemo, useState } from 'react';
import RadialMap from './RadialMap.jsx';
import ChatPanel from './ChatPanel.jsx';
import { buildGraph, STATUS } from './layout.js';

const LS_STATUS = 'agentmap.status.v1';
const LS_THEME = 'agentmap.theme.v1';

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pos, setPos] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [query, setQuery] = useState('');
  const [fitSignal, setFitSignal] = useState(0);
  const [overrides, setOverrides] = useState(() => lsGet(LS_STATUS, {}));
  const [theme, setTheme] = useState(() => lsGet(LS_THEME, null) || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    lsSet(LS_THEME, theme);
  }, [theme]);

  const load = () => {
    fetch(`./agents.json?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`agents.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const graph = useMemo(() => (data ? buildGraph(data) : { nodes: [], edges: [] }), [data]);
  const byId = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph]);

  const statusOf = (n) => overrides[n.id] || n.status || 'idle';
  const setStatus = (id, s) => {
    const next = { ...overrides };
    if (s === null) delete next[id];
    else next[id] = s;
    setOverrides(next);
    lsSet(LS_STATUS, next);
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const s = new Set();
    for (const n of graph.nodes) {
      const hay = [n.label, n.meta?.description, n.meta?.role, n.meta?.model, n.meta?.kind].filter(Boolean).join(' ').toLowerCase();
      if (hay.includes(q)) {
        s.add(n.id);
        // keep ancestors visible
        let cur = n;
        while (cur?.parent) {
          s.add(cur.parent);
          cur = byId[cur.parent];
        }
      }
    }
    return s;
  }, [query, graph, byId]);

  const stats = useMemo(() => {
    const agents = graph.nodes.filter((n) => n.level === 2).length;
    const subs = graph.nodes.filter((n) => n.level === 3).length;
    const live = graph.nodes.filter((n) => n.level >= 2 && statusOf(n) === 'live').length;
    return { clients: data?.clients?.length || 0, agents, subs, live };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, overrides, data]);

  const toggleClient = (id) => {
    setHidden((h) => {
      const n = new Set(h);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setTimeout(() => setFitSignal((s) => s + 1), 0);
  };

  const sel = selectedId ? byId[selectedId] : null;
  const children = sel ? graph.nodes.filter((n) => n.parent === sel.id) : [];
  const parent = sel?.parent ? byId[sel.parent] : null;

  if (error) {
    return (
      <div className="empty">
        <h2>agents.json belum ada</h2>
        <p>{error}</p>
        <p>Jalankan <code>npm run scan</code> lalu muat ulang.</p>
      </div>
    );
  }
  if (!data) return <div className="empty">Memuat…</div>;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>{data.title || 'Agent Map'}</h1>
            <p className="muted">
              {stats.clients} platform · {stats.agents} agent · {stats.subs} sub-agent
            </p>
          </div>
        </div>

        <input
          className="search"
          placeholder="Cari agent, skill, model…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="section-title">Platform</div>
        <div className="chips">
          {data.clients.map((c) => (
            <button
              key={c.id}
              className={'chip' + (hidden.has(c.id) ? ' off' : '')}
              onClick={() => toggleClient(c.id)}
              style={{ '--c': c.color }}
            >
              <span className="dot" />
              {c.name}
              <em>{(c.agents || []).length}</em>
            </button>
          ))}
        </div>

        <div className="section-title">Legenda</div>
        <ul className="legend">
          <li><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="var(--fg)" /></svg> Live</li>
          <li><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="var(--fg)" fillOpacity=".35" stroke="var(--fg)" strokeWidth="2.5" /></svg> Dalam pengembangan</li>
          <li><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--fg)" strokeWidth="1.5" /></svg> Idle</li>
          <li><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="var(--fg)" strokeDasharray="3 3" opacity=".55" /></svg> Direncanakan</li>
        </ul>

        <div className="spacer" />
        <div className="side-actions">
          <button onClick={() => { setPos({}); setTimeout(() => setFitSignal((s) => s + 1), 0); }}>Reset tata letak</button>
          <button onClick={load}>Muat ulang data</button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}</button>
        </div>
        <p className="muted small">Dipindai: {data.generatedAt ? new Date(data.generatedAt).toLocaleString('id-ID') : '—'}</p>
      </aside>

      <main className="stage">
        <RadialMap
          nodes={graph.nodes}
          edges={graph.edges}
          pos={pos}
          setPos={setPos}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hidden={hidden}
          matches={matches}
          statusOf={statusOf}
          fitSignal={fitSignal}
        />
        <div className="hint">Seret node untuk memindahkan · scroll untuk zoom · klik untuk detail</div>
      </main>

      {sel && (
        <aside className="detail">
          <button className="close" onClick={() => setSelectedId(null)} aria-label="Tutup">×</button>
          <div className="kicker" style={{ color: sel.color }}>
            {sel.type === 'root' ? 'Pusat' : sel.type === 'client' ? 'Platform' : sel.type === 'agent' ? 'Agent' : (sel.meta?.kind || 'Sub-agent')}
          </div>
          <h2>{sel.label}</h2>
          {parent && parent.level > 0 && (
            <button className="link" onClick={() => setSelectedId(parent.id)}>↑ {parent.label}</button>
          )}
          {sel.level >= 2 && (
            <div className="status-row">
              {Object.entries(STATUS).map(([k, label]) => (
                <button
                  key={k}
                  className={'st' + (statusOf(sel) === k ? ' on' : '')}
                  onClick={() => setStatus(sel.id, k)}
                >
                  {label}
                </button>
              ))}
              {overrides[sel.id] && <button className="st reset" onClick={() => setStatus(sel.id, null)}>Reset</button>}
            </div>
          )}
          {sel.meta?.description && <p className="desc">{sel.meta.description}</p>}
          {sel.meta?.runtime?.chat && (
            <ChatPanel agentId={sel.id} kind={sel.meta.runtime.chat} label={sel.label} />
          )}
          <dl>
            {sel.meta?.role && (<><dt>Peran</dt><dd>{sel.meta.role}</dd></>)}
            {sel.meta?.model && (<><dt>Model</dt><dd><code>{sel.meta.model}</code></dd></>)}
            {sel.meta?.source && (<><dt>Sumber</dt><dd><code>{sel.meta.source}</code></dd></>)}
            {sel.meta?.tools?.length > 0 && (<><dt>Tools</dt><dd className="tags">{sel.meta.tools.map((t) => <span key={t}>{t}</span>)}</dd></>)}
            {sel.meta?.updatedAt && (<><dt>Terakhir aktif</dt><dd>{new Date(sel.meta.updatedAt).toLocaleString('id-ID')}</dd></>)}
          </dl>
          {children.length > 0 && (
            <>
              <div className="section-title">{sel.level === 0 ? 'Platform' : sel.level === 1 ? 'Agent' : 'Sub-agent'} ({children.length})</div>
              <ul className="kids">
                {children.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSelectedId(c.id)}>
                      <span className={'pip ' + (c.level >= 2 ? statusOf(c) : 'live')} style={{ '--c': c.color }} />
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
