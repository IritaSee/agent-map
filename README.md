# Agent Map

Radial map (gaya SkillTree) untuk semua agent & sub-agent: Multica, Hermes, Claude, OpenClaw.

![Ringkasan peta (mode gelap)](docs/screenshots/01-overview-dark.png)

## Tampilan

| Panel detail agent | Pencarian |
|---|---|
| ![Panel detail](docs/screenshots/02-detail-panel.png) | ![Pencarian](docs/screenshots/03-search.png) |
| Klik node untuk melihat peran, sumber, sub-agent, dan menandai status. | Node yang tidak cocok meredup, cabang induknya tetap terlihat. |

| Filter platform | Mode terang |
|---|---|
| ![Filter platform](docs/screenshots/04-filter-platform.png) | ![Mode terang](docs/screenshots/05-overview-light.png) |
| Sembunyikan platform lewat chip di sidebar; peta otomatis di-fit ulang. | Tema mengikuti sistem, bisa diganti manual. |

> Screenshot diambil dari hasil scan config lokal asli (3 platform, 4 agent, 29 sub-agent).

## Menjalankan

```
npm install
npm run dev        # scan config -> public/agents.json -> vite + API companion -> buka http://localhost:5173
npm run scan       # hanya pindai ulang
npm run build      # produksi (dist/)
npm run api        # jalankan API companion saja (dibutuhkan chat saat npm run preview / hosting statis)
```

## Cara kerja
- `scripts/scan.mjs` membaca struktur config lokal (nama, skill, MCP, run) — **tidak** membaca token/kunci — lalu menulis `public/agents.json`.
- Frontend (`src/`) hanya membaca `agents.json`: Pusat → Platform → Agent → Sub-agent.
- Node bisa di-drag (parent membawa anaknya), scroll = zoom, klik = detail + tandai status (Live / Dev / Idle / Direncanakan, disimpan di browser).

## Sumber & path
Default: `~/.hermes`, `~/.multica`, `~/multica_workspaces_desktop-api.multica.ai`, `~/ai-agents/agent_setups`, `~/.claude`.
Ubah lewat `agentmap.config.json`:

```json
{ "title": "Agent Map", "rootName": "Command Center",
  "hermes": "~/.hermes", "claude": "~/.claude",
  "extraClients": [{ "id": "x", "name": "X", "color": "#0af",
    "agents": [{ "id": "x1", "name": "Agent X", "status": "live",
      "subagents": [{ "id": "x1a", "name": "Sub A", "status": "idle" }] }] }] }
```

`agents.json` bisa juga ditulis tangan/dari API Multica: cukup penuhi skema di atas.

## Chat dengan agent
Klik node yang punya runtime nyata (Claude Code, sub-agent Claude bernama, Hermes, workspace Multica, agent OpenClaw) untuk membuka panel chat/tugas di panel detail. Ini didukung oleh companion lokal di `server/` (`server/index.mjs` + `server/adapters/*.mjs`) yang di-boot otomatis lewat plugin Vite saat `npm run dev` (proxy `/api` → `http://127.0.0.1:8787`).

Setiap adapter hanya men-shell CLI platform yang sudah login sendiri (`claude`, `hermes`, `multica`, `nanobot`) — companion ini **tidak pernah** membaca file token siapa pun. Catatan per platform:
- **Claude Code**: setiap chat men-spawn proses `claude -p` headless baru — sesi terpisah dari Claude Code yang sedang kamu pakai, biaya/usage sendiri.
- **Sub-agent Claude bernama** (`~/.claude/agents/*.md`): best-effort — prompt meminta Claude mendelegasikan lewat Task tool, tidak terjamin benar-benar dijalankan oleh sub-agent tsb.
- **Hermes**: `hermes chat -q "<pesan>" -Q`, sesi baru tiap pesan (belum ada continuity — format output `-Q` belum dipetakan untuk resume).
- **Multica**: CLI-nya tidak punya chat langsung — "mengirim pesan" ke workspace sebenarnya membuat issue baru lewat `multica issue create --assignee-id ... --output json`.
- **OpenClaw/nanobot**: `nanobot agent --message "<pesan>" --workspace <folder agent>`.

Histori chat tersimpan lokal di `.agentmap/chat/<id>.json` (di-gitignore, jangan di-commit). Untuk build produksi statis, jalankan `npm run api` terpisah — ini deviasi yang disengaja dari prinsip "tanpa backend" di atas, khusus untuk fitur chat.

## Langkah lanjut
Continuity sesi untuk Hermes (perlu pemetaan format output `-Q`), adapter OpenClaw per-agent yang lebih presisi, dan status realtime (SSE) untuk hasil tugas Multica.
