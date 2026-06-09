import { io } from 'socket.io-client';

// Use env variable for backend URL - set VITE_API_URL in .env or Vercel dashboard
const URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const socket = io(URL, {
    autoConnect: true,
    reconnectionAttempts: 5,
});

export default socket;
