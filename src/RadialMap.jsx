import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { bounds, descendants } from './layout.js';

const RADIUS = { 0: 30, 1: 22, 2: 13, 3: 6.5 };

function edgePath(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // pull the control point toward the origin for a soft radial curve
  const cx = mx * 0.9;
  const cy = my * 0.9;
  return `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
}

export default function RadialMap({
  nodes,
  edges,
  pos,
  setPos,
  selectedId,
  onSelect,
  hidden,
  matches,
  statusOf,
  fitSignal,
}) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 640 });
  const [t, setT] = useState({ x: 450, y: 320, k: 0.5 });
  const [hoverId, setHoverId] = useState(null);
  const drag = useRef(null);
  const fitted = useRef(false);
  const tRef = useRef(t);
  const zoomTargetRef = useRef(null);
  const zoomRafRef = useRef(null);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const stopZoomAnim = useCallback(() => {
    if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
    zoomRafRef.current = null;
    zoomTargetRef.current = null;
  }, []);

  // eases the transform toward zoomTargetRef.current over a few frames, giving
  // scroll-wheel zoom a gradual glide instead of an instant jump
  const runZoomAnim = useCallback(() => {
    if (zoomRafRef.current) return;
    const step = () => {
      const target = zoomTargetRef.current;
      if (!target) {
        zoomRafRef.current = null;
        return;
      }
      const cur = tRef.current;
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const dk = target.k - cur.k;
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(dk) < 0.0008) {
        tRef.current = target;
        setT(target);
        zoomTargetRef.current = null;
        zoomRafRef.current = null;
        return;
      }
      const ease = 0.2;
      const next = { x: cur.x + dx * ease, y: cur.y + dy * ease, k: cur.k + dk * ease };
      tRef.current = next;
      setT(next);
      zoomRafRef.current = requestAnimationFrame(step);
    };
    zoomRafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => stopZoomAnim, [stopZoomAnim]);

  const P = useCallback((n) => pos[n.id] || n, [pos]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  const visible = useMemo(
    () => nodes.filter((n) => n.level === 0 || !hidden.has(n.client)),
    [nodes, hidden]
  );
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    stopZoomAnim();
    const b = bounds(visible, pos);
    const bw = b.maxX - b.minX + 260;
    const bh = b.maxY - b.minY + 200;
    const k = Math.min(size.w / bw, size.h / bh, 1.4);
    const next = {
      k,
      x: size.w / 2 - ((b.minX + b.maxX) / 2) * k,
      y: size.h / 2 - ((b.minY + b.maxY) / 2) * k,
    };
    tRef.current = next;
    setT(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pos, size]);

  useEffect(() => {
    if (size.w > 0 && size.h > 0 && nodes.length && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [size, nodes, fit]);

  useEffect(() => {
    if (fitSignal) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  const toWorld = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: (clientX - r.left - t.x) / t.k, y: (clientY - r.top - t.y) / t.k };
  };

  const zoomAt = (factor, cx, cy) => {
    // chain off the in-flight target (not the rendered t) so repeated wheel
    // ticks keep compounding smoothly instead of fighting the running animation
    const base = zoomTargetRef.current || tRef.current;
    const k = Math.min(3, Math.max(0.15, base.k * factor));
    const f = k / base.k;
    zoomTargetRef.current = { k, x: cx - (cx - base.x) * f, y: cy - (cy - base.y) * f };
    runZoomAnim();
  };

  const onWheel = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    // scale the step with scroll intensity (clamped) so light trackpad
    // scrolling is gentler than before and hard mouse-wheel ticks stay tame
    const intensity = Math.min(Math.abs(e.deltaY), 120);
    const factor = Math.exp((e.deltaY < 0 ? 1 : -1) * intensity * 0.0007);
    zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
  };

  // attach wheel as non-passive so we can preventDefault
  useEffect(() => {
    const el = wrapRef.current;
    const h = (e) => {
      e.preventDefault();
      onWheel(e);
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  });

  const onBgDown = (e) => {
    if (e.target.closest('[data-node]')) return;
    stopZoomAnim();
    drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onNodeDown = (e, n) => {
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    const p = P(n);
    const ids = n.level === 3 ? [n.id] : [n.id, ...descendants(nodes, n.id)];
    const start = {};
    ids.forEach((id) => {
      const q = P(byId[id]);
      start[id] = { x: q.x, y: q.y };
    });
    drag.current = { type: 'node', id: n.id, ids, start, wx: w.x, wy: w.y, sx: e.clientX, sy: e.clientY, moved: false, px: p.x, py: p.y };
    wrapRef.current.querySelector('svg').setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.type === 'pan') {
      setT((cur) => ({ ...cur, x: d.ox + dx, y: d.oy + dy }));
    } else {
      const w = toWorld(e.clientX, e.clientY);
      const ddx = w.x - d.wx;
      const ddy = w.y - d.wy;
      setPos((cur) => {
        const next = { ...cur };
        d.ids.forEach((id) => {
          next[id] = { x: d.start[id].x + ddx, y: d.start[id].y + ddy };
        });
        return next;
      });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      if (d.type === 'node') onSelect(d.id);
      else onSelect(null);
    }
  };

  // focus set: hovered/selected node + its ancestors + descendants
  const focusId = hoverId || selectedId;
  const related = useMemo(() => {
    if (!focusId || !byId[focusId]) return null;
    const s = new Set([focusId, ...descendants(nodes, focusId)]);
    let cur = byId[focusId];
    while (cur && cur.parent) {
      s.add(cur.parent);
      cur = byId[cur.parent];
    }
    return s;
  }, [focusId, nodes, byId]);

  const hasQuery = matches !== null;

  const nodeOpacity = (n) => {
    if (hasQuery) return matches.has(n.id) || n.level === 0 ? 1 : 0.12;
    if (related) return related.has(n.id) ? 1 : 0.16;
    return 1;
  };

  const subCount = useMemo(() => nodes.filter((n) => n.level === 3).length, [nodes]);
  const fs = (base) => base * Math.min(2.2, Math.max(1, 1 / Math.pow(t.k, 0.65)));

  const showLabel = (n) => {
    if (n.level <= 2) return true;
    return subCount <= 70 || t.k > 0.85 || n.id === selectedId || n.id === hoverId || (hasQuery && matches.has(n.id));
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="map-svg"
      >
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="var(--fg)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--fg)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {[190, 390].map((r) => (
            <circle key={r} r={r} className="ring" />
          ))}
          <circle r={140} fill="url(#glow)" />

          {edges.map((e) => {
            if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return null;
            const a = P(byId[e.from]);
            const b = P(byId[e.to]);
            const to = byId[e.to];
            const op = hasQuery
              ? matches.has(e.to) && (matches.has(e.from) || byId[e.from].level === 0) ? 0.7 : 0.05
              : related
              ? related.has(e.from) && related.has(e.to) ? 0.85 : 0.06
              : 0.32;
            return (
              <path
                key={e.from + '>' + e.to}
                d={edgePath(a, b)}
                className="edge"
                stroke={to.color}
                strokeOpacity={op}
                strokeWidth={to.level === 1 ? 2.2 : to.level === 2 ? 1.5 : 1}
              />
            );
          })}

          {visible.map((n) => {
            const p = P(n);
            const r = RADIUS[n.level];
            const st = n.level >= 2 ? statusOf(n) : null;
            const ang = Math.atan2(p.y, p.x);
            const right = Math.cos(ang) >= 0;
            const isSel = n.id === selectedId;
            let fill = n.color;
            let stroke = n.color;
            let fillOp = 1;
            let dash = undefined;
            let strokeW = 1.5;
            if (st === 'idle') { fill = 'var(--bg)'; }
            if (st === 'dev') { fillOp = 0.35; strokeW = 2.5; }
            if (st === 'planned') { fill = 'var(--bg)'; dash = '3 3'; }
            const dim = st === 'planned' ? 0.55 : 1;
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${p.x},${p.y})`}
                opacity={nodeOpacity(n) * dim}
                className="node"
                onPointerDown={(e) => onNodeDown(e, n)}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
              >
                {isSel && <circle r={r + 7} className="sel" stroke={n.color} />}
                {n.level === 0 ? (
                  <>
                    <circle r={r} fill="var(--fg)" />
                    <circle r={r - 8} fill="var(--bg)" />
                    <circle r={r - 14} fill="var(--fg)" />
                  </>
                ) : (
                  <circle
                    r={r}
                    fill={fill}
                    fillOpacity={fillOp}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    strokeDasharray={dash}
                  />
                )}
                {n.level === 0 && (
                  <text y={r + 20 * fs(1)} textAnchor="middle" className="lbl lbl-root" style={{ fontSize: fs(14) }}>
                    {n.label}
                  </text>
                )}
                {n.level === 1 && (
                  <text y={-r - 10} textAnchor="middle" className="lbl lbl-client" style={{ fontSize: fs(15) }}>
                    {n.label}
                  </text>
                )}
                {n.level >= 2 && showLabel(n) && (
                  <text
                    x={right ? r + 7 : -r - 7}
                    y={4}
                    textAnchor={right ? 'start' : 'end'}
                    className={n.level === 2 ? 'lbl lbl-agent' : 'lbl lbl-sub'}
                    style={{ fontSize: fs(n.level === 2 ? 12.5 : 10.5), strokeWidth: 3.5 * fs(1) }}
                  >
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="zoom">
        <button onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)} aria-label="Zoom out">−</button>
        <button onClick={fit} className="fit">Fit</button>
      </div>
    </div>
  );
}
