import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
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

const roomUsers = new Map();
const rooms = new Map(); // Track room metadata (creation time, etc.)

const colorPool = ['#06b6d4', '#8b5cf6', '#10b981', '#ec4899', '#f59e0b', '#f43f5e'];

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
    const color = colorPool[usersInRoom.size % colorPool.length];
    usersInRoom.set(socket.id, {
      id: socket.id,
      name,
      initial: String(name).trim().slice(0, 1).toUpperCase() || '?',
      color,
    });

    socket.emit('join-success', { roomId, userId: socket.id });
    broadcastRoomUsers(roomId);
  });

  socket.on('document-change', ({ roomId, content }) => {
    if (!roomId) {
      return;
    }

    socket.to(roomId).emit('document-change', {
      content,
      senderId: socket.id,
    });
  });

  socket.on('cursor-change', ({ roomId, position }) => {
    if (!roomId || !roomUsers.has(roomId)) {
      return;
    }

    const user = roomUsers.get(roomId)?.get(socket.id);
    if (!user) {
      return;
    }

    socket.to(roomId).emit('cursor-change', {
      user: {
        id: user.id,
        name: user.name,
        initial: user.initial,
        color: user.color,
      },
      position,
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
  res.json({ ok: true });
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
