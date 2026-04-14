import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentEvent } from '@agentflow/core';

let wss: WebSocketServer | null = null;

export function createWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws/events' });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'hello', message: 'agentflow:connected' }));
  });
  return wss;
}

export function broadcastEvent(event: AgentEvent): void {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'event', data: event });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}
