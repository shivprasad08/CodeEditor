# CodeEditor — Real-Time Collaborative Code Editor

A multi-user collaborative code editor with shared room sessions, real-time code sync, live cursor presence, input/output execution panel, and a modern VS Code-inspired interface.

## Highlights

- Real-time collaborative code editing by room
- Live connected users list
- Real-time collaborative cursors (with per-user color + name labels)
- Shared text selection highlights across users
- Shared language/input state for all users in a room
- Code submission pipeline with background worker
- Redis-backed messaging + room output routing
- VS Code Dark+ themed editor layout

## Tech Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS + Recoil
- Editor: Monaco (`@monaco-editor/react`)
- Realtime: Native WebSocket (`ws`)
- Backend API: Node.js + Express
- Worker: Node.js worker service
- Infra: Redis (Docker)
- Monorepo: npm workspaces + Turborepo

## Monorepo Structure

```text
apps/
	frontend/          # React app (UI + Monaco editor)
	express-server/    # API server (submission endpoint)
	websocket-server/  # Realtime room + collaboration server
	worker/            # Code execution/processing worker

packages/
	eslint-config/
	typescript-config/
```

## Architecture

1. Users connect to `websocket-server` with `roomId`, `id`, and `name`.
2. Server creates/joins room and broadcasts room users.
3. Frontend syncs code/input/language/button state in real time.
4. Cursor presence and selection ranges are published and broadcast to other users.
5. `express-server` accepts code submissions and pushes jobs.
6. `worker` processes submissions and publishes output.
7. `websocket-server` routes output back to the correct room/user.

## Prerequisites

- Node.js `>= 18`
- npm `>= 10`
- Docker Desktop (for Redis)

## Quick Start

### 1) Install dependencies

```bash
npm install
```

### 2) Start Redis

```bash
docker compose up -d
```

### 3) Build backend services (first time / after clean checkout)

```bash
npm run build
```

### 4) Run all services

```bash
npm run dev
```

This starts all workspace apps through Turbo.

## App URLs / Ports

- Frontend (Vite): usually `http://localhost:5173`
- Express API: `http://localhost:3000`
- WebSocket server: `ws://localhost:5000`
- Redis: `localhost:6379`

## Core Collaboration Events (WebSocket)

- `users` — room users broadcast
- `code` — code text sync
- `input` — stdin/input sync
- `language` — language sync
- `submitBtnStatus` — submit state sync
- `presenceSnapshot` — initial remote cursor snapshot
- `presenceUpdate` — cursor + selection updates
- `presenceRemove` — remove remote cursor when user disconnects

Presence payload shape:

```json
{
	"userId": "abc123",
	"name": "John",
	"color": "#E040FB",
	"position": { "x": 540, "y": 320 },
	"selection": { "start": 10, "end": 25 }
}
```

## Scripts

At repo root:

- `npm run dev` — run all apps in dev mode
- `npm run build` — build all apps
- `npm run lint` — lint all apps
- `npm run format` — format TS/TSX/MD files

## Troubleshooting

- If Redis connection fails, ensure Docker Desktop is running, then rerun:

	```bash
	docker compose up -d
	```

- If backend services complain about missing `dist` files:

	```bash
	npm run build
	```

- If frontend does not reflect latest style/code updates, do a hard refresh (`Ctrl+F5`).

## Notes

- User avatar colors are unique per user and remain consistent during a session.
- Collaborative cursor and selection rendering includes idle fade-out + smooth movement.

---

If you want, this README can also be split into:

- `README.md` (quick start only)
- `docs/ARCHITECTURE.md` (deep technical design)
- `docs/CONTRIBUTING.md` (dev workflow + conventions)




