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

// For hosted deployments, use ONLY same-origin (no fallbacks)
// For local deployments, use multiple candidates with fallback
const SOCKET_URL = isHostedDeployment()
  ? window.location.origin
  : getRuntimeSocketBase() || 'http://localhost:4000';

const fallbackCandidates = isHostedDeployment()
  ? [SOCKET_URL]  // No fallbacks for hosted
  : [
      getRuntimeSocketBase(),
      import.meta.env.VITE_SOCKET_URL,
      import.meta.env.VITE_SERVER_URL,
      'http://localhost:4000',
      'http://localhost:5000',
    ].filter(Boolean);

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

// ONLY enable fallback logic for LOCAL deployments
// Hosted deployments must NEVER fall back
if (!isHostedDeployment()) {
  let fallbackAttempt = 0;

  socket.on('connect_error', (error) => {
    // Verify we're still in local mode (double-check)
    const nowHosted = !isLocalOrIpHost(window.location.hostname);
    if (nowHosted) {
      return; // Never fall back on hosted
    }

    // Try next candidate
    if (fallbackAttempt < fallbackCandidates.length - 1) {
      fallbackAttempt++;
      const nextUrl = fallbackCandidates[fallbackAttempt];
      if (nextUrl) {
        console.log(`[Socket] Fallback attempt ${fallbackAttempt}: ${nextUrl}`);
        socket.io.uri = nextUrl;
        socket.connect();
      }
    }
  });

  // Reset fallback counter on successful connection
  socket.on('connect', () => {
    fallbackAttempt = 0;
  });
}
