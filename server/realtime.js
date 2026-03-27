import { Server } from 'socket.io';

let ioInstance = null;

function emitIfReady(eventName, payload) {
  if (!ioInstance) {
    return;
  }

  ioInstance.emit(eventName, payload);
}

export function attachRealtime(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  ioInstance.on('connection', () => {
    // Connection lifecycle is intentionally simple for now.
  });

  return ioInstance;
}

export function getRealtimeServer() {
  return ioInstance;
}

export function emitOrderCreated(payload) {
  emitIfReady('order:created', payload);
}

export function emitOrderUpdated(payload) {
  emitIfReady('order:updated', payload);
}

export function emitOrderCancelled(payload) {
  emitIfReady('order:cancelled', payload);
}

export function emitStockChanged(payload) {
  emitIfReady('stock:changed', payload);
}