import { io } from 'socket.io-client';

const fallbackCandidates = [
  import.meta.env.VITE_SOCKET_URL,
  import.meta.env.VITE_SERVER_URL,
  'http://localhost:4000',
  'http://localhost:5000',
].filter(Boolean);

const SOCKET_URL = fallbackCandidates[0];

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  timeout: 2500,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 600,
});

socket.on('connect_error', () => {
  const current = socket.io.uri;
  const currentIndex = fallbackCandidates.indexOf(current);
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 1;

  if (nextIndex < fallbackCandidates.length) {
    socket.io.uri = fallbackCandidates[nextIndex];
    socket.connect();
  }
});
