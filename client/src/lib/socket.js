import { io } from 'socket.io-client';

function isLocalOrIpHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function getRuntimeSocketBase() {
  if (typeof window === 'undefined') {
    return null;
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname;
  if (!host) {
    return null;
  }

  if (isLocalOrIpHost(host)) {
    return `${protocol}//${host}:4000`;
  }

  // Hosted frontend (e.g. Vercel): use same-origin + rewrite/proxy rules.
  return window.location.origin;
}

function isHostedDeployment() {
  if (typeof window === 'undefined') {
    return false;
  }

  return !isLocalOrIpHost(window.location.hostname);
}

const fallbackCandidates = (isHostedDeployment()
  ? [window.location.origin]
  : [
      getRuntimeSocketBase(),
      import.meta.env.VITE_SOCKET_URL,
      import.meta.env.VITE_SERVER_URL,
      'http://localhost:4000',
      'http://localhost:5000',
    ]
).filter(Boolean);

const SOCKET_URL = fallbackCandidates[0];

let currentCandidateIndex = 0;

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  timeout: 2500,
  // External proxy rewrites are more reliable with polling-only transport.
  transports: isHostedDeployment() ? ['polling'] : ['websocket', 'polling'],
  upgrade: !isHostedDeployment(),
  path: '/socket.io',
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 600,
});

// Only apply fallback logic for local deployments
if (!isHostedDeployment()) {
  socket.on('connect_error', () => {
    if (isHostedDeployment()) {
      return; // Never fall back on hosted
    }

    currentCandidateIndex = Math.min(currentCandidateIndex + 1, fallbackCandidates.length - 1);
    const nextUrl = fallbackCandidates[currentCandidateIndex];

    if (nextUrl && nextUrl !== SOCKET_URL) {
      socket.io.uri = nextUrl;
      socket.connect();
    }
  });
}
