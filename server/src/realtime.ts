import type { Request, Response } from 'express';

// Server-Sent Events hub. Each signed-in browser tab keeps one stream open;
// the server pushes small "something changed" events and the client refetches.

export interface RealtimeEvent {
  type: 'order' | 'message' | 'notification' | 'announcement' | 'team' | 'runs' | 'settings';
  id?: number;
  threadId?: number;
}

const clients = new Map<number, Set<Response>>();

export function attachStream(req: Request, res: Response, userId: number): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 4000\n\n');
  let set = clients.get(userId);
  if (!set) clients.set(userId, (set = new Set()));
  set.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    set!.delete(res);
    if (set!.size === 0) clients.delete(userId);
  });
}

export function publish(userIds: Iterable<number>, event: RealtimeEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const seen = new Set<number>();
  for (const id of userIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    for (const res of clients.get(id) ?? []) res.write(payload);
  }
}

export function broadcast(event: RealtimeEvent): void {
  publish(clients.keys(), event);
}

export function isOnline(userId: number): boolean {
  return (clients.get(userId)?.size ?? 0) > 0;
}
