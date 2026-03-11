import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CompilePipeline } from './compilePipeline.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

function getExtension(language) {
  switch (language) {
    case 'javascript':
      return '.js';
    case 'python':
      return '.py';
    case 'cpp':
      return '.cpp';
    case 'java':
      return '.java';
    case 'rust':
      return '.rs';
    case 'go':
      return '.go';
    default:
      return '.txt';
  }
}

function getLanguageFromSnippetId(id) {
  let language = 'javascript';
  if (id.endsWith('.py')) language = 'python';
  if (id.endsWith('.cpp')) language = 'cpp';
  if (id.endsWith('.java')) language = 'java';
  if (id.endsWith('.rs')) language = 'rust';
  if (id.endsWith('.go')) language = 'go';
  return language;
}

const roomUsers = new Map();
const rooms = new Map(); // Track room metadata (creation time, etc.)

const compilePipeline = new CompilePipeline({
  onStatus: ({ roomId, submissionId, status, queueLength }) => {
    io.to(roomId).emit('compile-status', {
      roomId,
      submissionId,
      status,
      queueLength,
    });
  },
  onResult: ({ roomId, submissionId, language, ok, output, runner, durationMs, queueWaitMs }) => {
    io.to(roomId).emit('compile-output', {
      roomId,
      submissionId,
      language,
      ok,
      output,
      runner,
      durationMs,
      queueWaitMs,
      timestamp: new Date().toISOString(),
    });
  },
});

function getColorFromUserId(userId = '', usedColors = new Set()) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }

  // Start from a stable hue derived from user id, then step until unique in room.
  let hue = Math.abs(hash) % 360;
  let attempts = 0;

  while (attempts < 360) {
    const color = hslToHex(hue, 78, 56);
    if (!usedColors.has(color)) {
      return color;
    }
    hue = (hue + 29) % 360;
    attempts += 1;
  }

  return hslToHex(Math.abs(hash) % 360, 78, 56);
}

function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - (c / 2);

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function broadcastRoomUsers(roomId) {
  const usersMap = roomUsers.get(roomId) || new Map();
  const users = Array.from(usersMap.values());
  io.to(roomId).emit('room-users', { users });
}

function createRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      createdAt: new Date().toISOString(),
    });
  }
  return rooms.get(roomId);
}

function roomExists(roomId) {
  return rooms.has(roomId);
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name }) => {
    if (!roomId || !name) {
      socket.emit('join-error', { message: 'Missing roomId or name' });
      return;
    }

    // Ensure room exists
    createRoom(roomId);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;

    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }

    const usersInRoom = roomUsers.get(roomId);
    const usedColors = new Set(Array.from(usersInRoom.values()).map((entry) => entry.color));
    const color = getColorFromUserId(socket.id, usedColors);
    usersInRoom.set(socket.id, {
      id: socket.id,
      name,
      initial: String(name).trim().slice(0, 1).toUpperCase() || '?',
      color,
      presence: null,
    });

    const snapshot = Array.from(usersInRoom.values())
      .filter((entry) => entry.id !== socket.id && entry.presence?.position)
      .map((entry) => ({
        user: {
          id: entry.id,
          name: entry.name,
          initial: entry.initial,
          color: entry.color,
        },
        position: entry.presence.position,
        selection: entry.presence.selection,
      }));

    socket.emit('presence-snapshot', { users: snapshot });

    socket.emit('join-success', { roomId, userId: socket.id });
    broadcastRoomUsers(roomId);
  });

  socket.on('document-change', ({ roomId, content, language }) => {
    if (!roomId) {
      return;
    }

    socket.to(roomId).emit('document-change', {
      content,
      language,
      senderId: socket.id,
    });
  });

  socket.on('cursor-change', ({ roomId, position, selection }) => {
    if (!roomId || !roomUsers.has(roomId)) {
      return;
    }

    const user = roomUsers.get(roomId)?.get(socket.id);
    if (!user) {
      return;
    }

    user.presence = {
      position,
      selection,
      updatedAt: Date.now(),
    };

    socket.to(roomId).emit('cursor-change', {
      user: {
        id: user.id,
        name: user.name,
        initial: user.initial,
        color: user.color,
      },
      position,
      selection,
      senderId: socket.id,
    });
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data;

    if (!roomId || !roomUsers.has(roomId)) {
      return;
    }

    const usersInRoom = roomUsers.get(roomId);
    socket.to(roomId).emit('cursor-remove', { userId: socket.id });
    usersInRoom.delete(socket.id);

    if (usersInRoom.size === 0) {
      roomUsers.delete(roomId);
      return;
    }

    broadcastRoomUsers(roomId);
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    queueLength: compilePipeline.getQueueLength(),
    activeWorkers: compilePipeline.getActiveWorkers(),
  });
});

app.post('/api/submit', (req, res) => {
  const { roomId, code, language, input } = req.body || {};

  if (!roomId || !language || typeof code !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'Missing required fields: roomId, language, code',
    });
  }

  if (!roomExists(roomId)) {
    return res.status(404).json({
      ok: false,
      message: 'Room does not exist',
    });
  }

  const submission = compilePipeline.enqueue({
    roomId,
    code,
    language,
    input: input || '',
  });

  return res.status(202).json({
    ok: true,
    status: 'queued',
    submissionId: submission.submissionId,
    roomId,
  });
});

app.post('/api/rooms/validate', (req, res) => {
  const { roomId } = req.body || {};

  if (!roomId) {
    return res.status(400).json({ valid: false, message: 'Missing roomId' });
  }

  // For new rooms, always valid. For existing rooms, check they exist.
  // In this implementation, any valid format is allowed (rooms auto-create on join)
  const isValidFormat = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(roomId);

  if (!isValidFormat) {
    return res.status(400).json({ valid: false, message: 'Invalid room ID format' });
  }

  return res.json({ valid: true, exists: roomExists(roomId), roomId });
});

app.post('/snippets', async (req, res) => {
  const { code, language } = req.body || {};

  if (!process.env.AWS_S3_BUCKET_NAME) {
    return res.status(500).json({ error: 'Missing AWS_S3_BUCKET_NAME environment variable.' });
  }

  try {
    const snippetId = `snippet-${Date.now()}${getExtension(language)}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: snippetId,
      Body: code || '',
      ContentType: 'text/plain',
    });

    await s3.send(command);
    return res.status(200).json({ snippetId });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save snippet' });
  }
});

app.get('/snippets/:id', async (req, res) => {
  const { id } = req.params;

  if (!process.env.AWS_S3_BUCKET_NAME) {
    return res.status(500).json({ error: 'Missing AWS_S3_BUCKET_NAME environment variable.' });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: id,
    });

    const response = await s3.send(command);
    const code = await response.Body?.transformToString();

    return res.status(200).json({
      code,
      language: getLanguageFromSnippetId(id),
    });
  } catch (error) {
    return res.status(404).json({ error: 'Snippet not found' });
  }
});

app.delete('/snippets/:id', async (req, res) => {
  const { id } = req.params;

  if (!process.env.AWS_S3_BUCKET_NAME) {
    return res.status(500).json({ error: 'Missing AWS_S3_BUCKET_NAME environment variable.' });
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: id,
    });

    await s3.send(command);
    return res.status(200).json({ message: 'Snippet deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete snippet' });
  }
});


app.post('/api/save-to-cloud', async (req, res) => {
  const { roomId, content, fileName } = req.body || {};

  if (!process.env.AWS_S3_BUCKET) {
    return res.status(500).json({
      message: 'Missing AWS_S3_BUCKET environment variable.',
    });
  }

  const resolvedRoom = roomId || 'default-room';
  const resolvedFile = fileName || `room-${resolvedRoom}-${Date.now()}.txt`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `rooms/${resolvedRoom}/${resolvedFile}`,
    Body: content || '',
    ContentType: 'text/plain',
  });

  try {
    await s3.send(command);
    return res.status(200).json({
      message: 'Saved to cloud storage.',
      key: `rooms/${resolvedRoom}/${resolvedFile}`,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to save file to S3.',
      error: error.message,
    });
  }
});

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
