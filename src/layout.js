// Radial layout: root -> client (platform) -> agent -> sub-agent.
// Each client gets an angular sector proportional to its number of leaves.

export const STATUS = {
  live: 'Live',
  dev: 'Dalam pengembangan',
  idle: 'Idle',
  planned: 'Direncanakan',
};

export function buildGraph(data) {
  const nodes = [];
  const edges = [];
  const clients = data.clients || [];

  nodes.push({
    id: 'root',
    label: data.root?.name || 'Command Center',
    level: 0,
    type: 'root',
    x: 0,
    y: 0,
    color: '#8b8fa3',
  });

  const leaves = (c) =>
    Math.max(
      1,
      (c.agents || []).reduce((s, a) => s + Math.max(1, (a.subagents || []).length), 0)
    );
  const total = clients.reduce((s, c) => s + leaves(c), 0) || 1;

  const R1 = 190;
  const R2 = 390;
  const R3 = Math.max(560, (total * 30) / (2 * Math.PI));

  let a0 = -Math.PI / 2;
  for (const c of clients) {
    const span = (2 * Math.PI * leaves(c)) / total;
    const cAng = a0 + span / 2;
    nodes.push({
      id: c.id,
      label: c.name,
      level: 1,
      type: 'client',
      client: c.id,
      parent: 'root',
      color: c.color || '#6ea8fe',
      meta: c,
      x: R1 * Math.cos(cAng),
      y: R1 * Math.sin(cAng),
    });
    edges.push({ from: 'root', to: c.id, client: c.id });

    let a = a0;
    for (const ag of c.agents || []) {
      const subs = ag.subagents || [];
      const w = Math.max(1, subs.length);
      const aspan = (span * w) / leaves(c);
      const ang = a + aspan / 2;
      nodes.push({
        id: ag.id,
        label: ag.name,
        level: 2,
        type: 'agent',
        client: c.id,
        parent: c.id,
        color: c.color || '#6ea8fe',
        status: ag.status || 'idle',
        meta: ag,
        x: R2 * Math.cos(ang),
        y: R2 * Math.sin(ang),
      });
      edges.push({ from: c.id, to: ag.id, client: c.id });

      // stagger sub-agents on two radii when the arc gets tight
      const arcPerSub = (R3 * aspan) / w;
      const stagger = arcPerSub < 44;
      subs.forEach((s, i) => {
        const sa = a + (aspan * (i + 0.5)) / w;
        const r = R3 + (stagger && i % 2 ? 46 : 0);
        nodes.push({
          id: s.id,
          label: s.name,
          level: 3,
          type: 'subagent',
          client: c.id,
          parent: ag.id,
          color: c.color || '#6ea8fe',
          status: s.status || 'idle',
          meta: s,
          x: r * Math.cos(sa),
          y: r * Math.sin(sa),
        });
        edges.push({ from: ag.id, to: s.id, client: c.id });
      });
      a += aspan;
    }
    a0 += span;
  }
  return { nodes, edges };
}

export function descendants(nodes, id) {
  const out = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const n of nodes) {
      if (n.parent === cur) {
        out.push(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

export function bounds(nodes, pos) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    const p = pos[n.id] || n;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}
