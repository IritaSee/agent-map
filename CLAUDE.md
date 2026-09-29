# CLAUDE.md — Agent Map

Handoff untuk agent/sesi berikutnya. Baca ini dulu sebelum mengubah apa pun.

## Tujuan
Frontend "radial map" (gaya https://skilltree.altari.ai) yang memisahkan semua agent dan sub-agent milik Iga
(Multica sebagai client wrapper, Hermes, Claude, OpenClaw/nanobot) dalam satu peta interaktif.
Hierarki: Pusat (Command Center) → Platform → Agent → Sub-agent.

## Stack
React 18 + Vite 5, JavaScript (tanpa TypeScript), SVG murni (tanpa d3/library grafik). Tanpa backend.
Data dibaca dari `public/agents.json` (dihasilkan scanner).

## Perintah
```
npm install
npm run dev      # scan config -> public/agents.json -> vite di http://localhost:5173
npm run scan     # hanya pindai ulang
npm run build    # scan + build produksi ke dist/
```

## Struktur
- `scripts/scan.mjs` — scanner Node tanpa dependensi. Membaca struktur config lokal, menulis `public/agents.json`.
- `src/layout.js` — `buildGraph(data)`: layout radial (sektor sudut ∝ jumlah leaf; radius R1=190, R2=390, R3≥560), `descendants`, `bounds`, konstanta `STATUS`.
- `src/RadialMap.jsx` — render SVG, pan/zoom (wheel non-passive), drag node (level 1–2 membawa keturunannya, level 3 sendiri), fokus/hover meredupkan node tak terkait, skala font terhadap zoom.
- `src/App.jsx` — sidebar (pencarian, filter platform, legenda, reset layout, tema), panel detail, override status di localStorage (`agentmap.status.v1`, tema `agentmap.theme.v1`).
- `src/styles.css` — token warna di `:root` + `[data-theme='light']`.
- `agentmap.config.json` (opsional, belum dibuat) — override path & `extraClients`.

## Skema `agents.json`
```
{ title, root:{name}, generatedAt, warnings[],
  clients:[{ id, name, color, kind, agents:[{
     id, name, role?, model?, status: live|dev|idle|planned, updatedAt?, source?, description?,
     subagents:[{ id, name, kind?, description?, model?, tools?[], status, updatedAt?, source? }] }] }] }
```
`id` wajib unik global. Status dipetakan: live=terisi, dev=terisi transparan+tebal, idle=outline, planned=putus-putus & redup.

## Sumber data (default, bisa di-override via env/config)
| Platform | Path | Env | Yang dipetakan |
|---|---|---|---|
| Hermes | `~/.hermes` | `HERMES_DIR` | agent utama; sub-agent = kategori `skills/` + server MCP di `config.yaml`; `profiles/*` = agent tambahan |
| Multica | `~/multica_workspaces_desktop-api.multica.ai`, `~/.multica` | `MULTICA_WS_DIR`, `MULTICA_DIR` | agent = workspace (mis. narenteam); sub-agent = grup issue (NAR-32 dst) dari folder run; daemon = agent |
| OpenClaw | `~/ai-agents/agent_setups` | `OPENCLAW_DIR` | `agents/*`; `skills/*` sebagai sub-agent |
| Claude | `~/.claude` | `CLAUDE_DIR` | `agents/*.md` (frontmatter) + `skills/*/SKILL.md` |

Status diturunkan dari umur mtime (live ≤2–3 hari, idle ≤45 hari, selebihnya planned); run Multica yang belum selesai = dev.

## Aturan penting
- JANGAN membaca atau mencetak token/kunci: `~/.multica/**/config.json` (token), `.hermes/auth*`, `shared/nous_auth.json`, `.env`. Scanner hanya membaca nama/struktur.
- `agents.json` adalah artefak hasil scan — jangan diedit tangan kecuali untuk `extraClients` (pakai config).
- Jangan menambah library berat; peta sengaja SVG murni. Batas nyaman: ~300 node.
- Semua teks UI berbahasa Indonesia.

## Status saat ini (30 Sep 2026)
- Selesai & teruji (build, drag, klik→panel, pencarian): scan asli menghasilkan 3 platform, 4 agent, 29 sub-agent.
- Folder `~/.claude` belum diberi akses ke sesi Cowork → platform Claude belum muncul (scanner mencatat warning, tidak error).
- Scan pertama dijalankan dari VM sandbox dengan env var path `$HOME/mnt/...`; di macOS langsung, default `~` sudah benar.
- Sisa `agent-map.tgz` di `~/ai-agents/` (hasil transfer) — aman dihapus manual.

## Next steps (urut prioritas)
1. Jalankan `npm install && npm run dev` di Mac; cek Claude muncul setelah `~/.claude` terbaca.
2. Sambungkan API Multica (`https://api.multica.ai`) agar agent server-side asli tampil (token dari env, jangan di-commit); tambahkan sebagai sumber di `scan.mjs` atau endpoint terpisah.
3. Status realtime (polling `agents.json` / SSE) dan tampilan per-issue.
4. Simpan posisi node hasil drag (localStorage) dan ekspor/impor progres seperti SkillTree.
5. Tambah `agentmap.config.json` contoh + `.gitignore` (node_modules, dist, public/agents.json).
