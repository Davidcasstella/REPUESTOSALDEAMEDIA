import { io } from 'socket.io-client';

// Use env variable for backend URL - set VITE_API_URL in .env or Vercel dashboard
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const socket = io(BACKEND_URL, {
    autoConnect: true,
    reconnectionAttempts: 5,
    // Force polling transport for Cloudflare tunnel compatibility
    // (Cloudflare free tunnels don't support WebSocket upgrades reliably)
    transports: ['polling', 'websocket'],
    withCredentials: false,
});

export default socket;
