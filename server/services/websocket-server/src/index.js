import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createClient } from 'redis';

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const redisSub = createClient({ url: REDIS_URL });

const roomUsers = new Map();
const rooms = new Map();
const roomSubscriptions = new Set();
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

function createRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      createdAt: new Date().toISOString(),
    });
  }

  return rooms.get(roomId);
}

function broadcastRoomUsers(roomId) {
  const usersMap = roomUsers.get(roomId) || new Map();
  const users = Array.from(usersMap.values());
  io.to(roomId).emit('room-users', { users });
}

async function ensureRoomSubscribed(roomId) {
  if (roomSubscriptions.has(roomId)) {
    return;
  }

  await redisSub.subscribe(roomId, (message) => {
    try {
      const parsed = JSON.parse(message);
      if (!parsed?.event || !parsed?.payload) {
        return;
      }

      io.to(roomId).emit(parsed.event, parsed.payload);
    } catch {
      io.to(roomId).emit('compile-output', {
        roomId,
        ok: false,
        output: message,
      });
    }
  });

  roomSubscriptions.add(roomId);
}

async function maybeCleanupRoom(roomId) {
  const usersInRoom = roomUsers.get(roomId);
  if (usersInRoom && usersInRoom.size > 0) {
    return;
  }

  roomUsers.delete(roomId);
  rooms.delete(roomId);

  if (roomSubscriptions.has(roomId)) {
    await redisSub.unsubscribe(roomId);
    roomSubscriptions.delete(roomId);
  }
}

io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, name }) => {
    if (!roomId || !name) {
      socket.emit('join-error', { message: 'Missing roomId or name' });
      return;
    }

    try {
      createRoom(roomId);
      await ensureRoomSubscribed(roomId);

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
    } catch {
      socket.emit('join-error', { message: 'Failed to join room' });
    }
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

  socket.on('disconnect', async () => {
    const { roomId } = socket.data;

    if (!roomId || !roomUsers.has(roomId)) {
      return;
    }

    const usersInRoom = roomUsers.get(roomId);
    socket.to(roomId).emit('cursor-remove', { userId: socket.id });
    usersInRoom.delete(socket.id);

    if (usersInRoom.size === 0) {
      await maybeCleanupRoom(roomId);
      return;
    }

    broadcastRoomUsers(roomId);
  });
});

async function main() {
  redisSub.on('error', (error) => {
    console.error('[websocket-server] Redis error:', error.message);
  });

  await redisSub.connect();

  httpServer.listen(PORT, () => {
    console.log(`[websocket-server] listening on ${PORT}`);
  });
}

main().catch((error) => {
  console.error('[websocket-server] startup failed:', error);
  process.exit(1);
});
