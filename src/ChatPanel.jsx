import React, { useEffect, useRef, useState } from 'react';

const ROLE_LABEL = { user: 'Kamu', error: 'Error' };

export default function ChatPanel({ agentId, kind, label }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const isTask = kind === 'multica-task';

  useEffect(() => {
    setMessages([]);
    setInput('');
    setTitle('');
    fetch(`/api/chat/${encodeURIComponent(agentId)}/history`)
      .then((r) => r.json())
      .then((h) => setMessages(h.messages || []))
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  const send = async () => {
    const body = isTask ? [title.trim(), input.trim()].filter(Boolean).join('\n') : input.trim();
    if (!body || busy) return;
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: body, ts: Date.now() }]);
    setInput('');
    setTitle('');
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(agentId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: body }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Gagal mengirim');
      setMessages((m) => [...m, { role: 'agent', text: data.reply, ts: Date.now() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: e.message, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-panel">
      <div className="section-title">
        {isTask ? 'Buat tugas' : 'Chat'}
        {kind === 'claude-subagent' && <span className="chat-note"> · sesi terpisah, best-effort</span>}
        {kind === 'claude-session' && <span className="chat-note"> · sesi baru, terpisah dari sesi ini</span>}
      </div>

      <div className="chat-thread">
        {messages.length === 0 && <p className="muted small">{isTask ? 'Belum ada tugas.' : 'Belum ada percakapan.'}</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <span className="who">{ROLE_LABEL[m.role] || label}</span>
            <p>{m.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {isTask ? (
        <div className="chat-form">
          <input placeholder="Judul tugas (opsional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            placeholder="Deskripsi tugas…"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button onClick={send} disabled={busy || !input.trim()}>
            {busy ? 'Mengirim…' : 'Buat tugas'}
          </button>
        </div>
      ) : (
        <div className="chat-form">
          <textarea
            placeholder="Tulis pesan…"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button onClick={send} disabled={busy || !input.trim()}>
            {busy ? 'Mengirim…' : 'Kirim'}
          </button>
        </div>
      )}
    </div>
  );
}
