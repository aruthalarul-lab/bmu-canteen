import { io } from 'socket.io-client';

// When running under Vite dev server, proxy handles socket.io.
// In production, socket connects to current window.location.origin.
const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.port === '3000' ? 'http://localhost:5000' : window.location.origin);

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export default socket;
