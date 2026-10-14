// Socket.IO transport for the alert bus. Clients receive alert:new, alert:updated and alert:resolved, each carrying the full
// alert object in the same shape as GET /api/alerts. After a reconnect a client must refetch GET /api/alerts: events sent while it
// was offline are not replayed.
import { Server } from 'socket.io';

export function attachRealtime(httpServer, { events, config, log = console.log }) {
  const io = new Server(httpServer, { cors: { origin: config.corsOrigins, methods: ['GET', 'POST'] }, serveClient: false });
  events.on('alert', ({ event, alert }) => {
    io.emit(event, alert);
    log(`[SOCKET] ${event} emitted: ${alert.id} (${io.engine.clientsCount} client${io.engine.clientsCount === 1 ? '' : 's'})`);
  });
  // Pond/reading events share the one server and socket: pond:reading_updated, pond:updated, pond:forecast_updated.
  events.on('pond', ({ event, payload }) => {
    io.emit(event, payload);
    log(`[SOCKET] ${event} emitted: pond ${payload.pondId} (${io.engine.clientsCount} client${io.engine.clientsCount === 1 ? '' : 's'})`);
  });
  io.on('connection', (socket) => log(`[SOCKET] client connected (${io.engine.clientsCount} total)`));
  return io;
}
