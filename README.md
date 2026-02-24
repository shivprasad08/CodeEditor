# Real-time Collaborative Code Editor

Minimal full-stack boilerplate for a distraction-free collaborative code editor.

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
- Backend: `http://localhost:4000`
- Save route: `POST /api/save-to-cloud`

## Collaboration Events
- `join-room`
- `document-change`
- `cursor-change`
- `room-users`
