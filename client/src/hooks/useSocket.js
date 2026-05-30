import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3001';

/**
 * Singleton socket connection shared across the app.
 */
let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
  }
  return socketInstance;
}

/**
 * useSocket — provides typed socket helpers and connection state.
 * @returns {{
 *   socket: import('socket.io-client').Socket,
 *   connected: boolean,
 *   emit: (event: string, data?: any) => void,
 *   on: (event: string, handler: Function) => () => void,
 * }}
 */
export function useSocket() {
  const socket = getSocket();
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  const emit = useCallback((event, data) => {
    socket.emit(event, data);
  }, [socket]);

  /**
   * Subscribe to a socket event, returns an unsubscribe function.
   */
  const on = useCallback((event, handler) => {
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket]);

  return { socket, connected, emit, on };
}
