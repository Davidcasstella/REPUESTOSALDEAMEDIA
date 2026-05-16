import { io } from 'socket.io-client';

const URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin;

const socket = io(URL, {
    autoConnect: true,
    reconnectionAttempts: 5,
});

export default socket;
