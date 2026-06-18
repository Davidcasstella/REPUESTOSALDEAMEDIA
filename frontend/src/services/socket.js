import { io } from 'socket.io-client';

// Use env variable for backend URL - set VITE_API_URL in .env or Vercel dashboard
const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const socket = io(BACKEND_URL, {
    autoConnect: true,
    reconnectionAttempts: 5,
    // CloudFront supports native WebSocket upgrades
    transports: ['websocket', 'polling'],
    withCredentials: false,
});

export default socket;
