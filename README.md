# Real-time Collaborative Code Editor

Minimal full-stack boilerplate for a distraction-free collaborative code editor.

Updated architecture now follows:
- realtime room collaboration over WebSocket
- submit API (`/api/submit`) to push code execution jobs to an internal queue
- worker pool processing queued jobs
- room-scoped WebSocket fan-out for compile status/output

## Multi-Service (Docker)
The repo now includes `docker-compose.yml` for a split backend:
- `redis` (queue + pub/sub)
- `submit-api` on `3000`
- `websocket-server` on `5000`
- `worker` (queue consumer + code execution)
- `client` (Vite) on `5173`

Prerequisite on Windows: start Docker Desktop and ensure the Linux engine is running.

Run it:

```bash
docker compose up -d --build
```

Stop services:

```bash
docker compose down
```

## Stack
- React + Vite + Tailwind CSS
- Monaco Editor
- Socket.io (client + server)
- Node.js + Express
- AWS SDK v3 (S3 upload hook)

## Quick Start
1. Install dependencies:
   ```bash
   npm install
   npm install --workspace client
   npm install --workspace server
   ```
2. Configure backend env:
   - Copy `server/.env.example` to `server/.env`
   - Set AWS and app variables
3. Run both apps:
   ```bash
   npm run dev
   ```

## Default Endpoints
- Frontend: `http://localhost:5173`
- Submit API: `http://localhost:3000`
- WebSocket server: `http://localhost:5000`
- Compile submit route: `POST http://localhost:3000/api/submit`
- Save route: `POST http://localhost:3000/api/save-to-cloud`
- Snippet save route: `POST http://localhost:3000/snippets`
- Snippet load route: `GET http://localhost:3000/snippets/:id`
- Snippet delete route: `DELETE http://localhost:3000/snippets/:id`

## Collaboration Events
- `join-room`
- `document-change`
- `cursor-change`
- `room-users`
- `compile-status`
- `compile-output`

## Compile Runtime
- `CODE_RUNNER_MODE=auto` (default): Docker first, local Node fallback for JavaScript
- `CODE_RUNNER_MODE=docker`: Docker-only execution
- `CODE_RUNNER_MODE=local`: local Node-only (JavaScript)

Additional server envs:
- `WORKER_COUNT` (parallel compile workers)
- `CODE_TIMEOUT_MS` (per submission timeout)

For Docker execution from worker container, Docker socket is mounted in `docker-compose.yml`.

Note: first run of a language may download Docker images (`gcc`, `python`, `openjdk`, etc.).
If your network is slow, first compile can exceed low timeouts. Default timeout is set to `60000ms`.
Optional warm-up:

```bash
docker pull gcc:13 python:3.11 node:20 openjdk:21 golang:1.22 rust:1.77
```
