import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface Evt {
  type: 'order' | 'message' | 'notification' | 'announcement' | 'team' | 'runs' | 'settings';
  id?: number;
  threadId?: number;
}

/** Keep every open screen in sync: the server says what changed, we refetch it. */
export function useRealtime(enabled: boolean): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      let evt: Evt;
      try {
        evt = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (evt.type) {
        case 'order':
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['run-sheet'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
          if (evt.id) qc.invalidateQueries({ queryKey: ['order', evt.id] });
          break;
        case 'message':
          qc.invalidateQueries({ queryKey: ['threads'] });
          if (evt.threadId) qc.invalidateQueries({ queryKey: ['thread', evt.threadId] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
          break;
        case 'notification':
          qc.invalidateQueries({ queryKey: ['notifications'] });
          qc.invalidateQueries({ queryKey: ['badges'] });
          break;
        case 'announcement':
          qc.invalidateQueries({ queryKey: ['announcements'] });
          break;
        case 'team':
          qc.invalidateQueries({ queryKey: ['me'] });
          qc.invalidateQueries({ queryKey: ['family'] });
          qc.invalidateQueries({ queryKey: ['admin-team'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
          break;
        case 'runs':
          qc.invalidateQueries({ queryKey: ['runs'] });
          qc.invalidateQueries({ queryKey: ['public-info'] });
          break;
        case 'settings':
          qc.invalidateQueries({ queryKey: ['public-info'] });
          qc.invalidateQueries({ queryKey: ['services'] });
          qc.invalidateQueries({ queryKey: ['locations'] });
          break;
      }
    };
    // When the connection drops we may have missed events — refresh everything visible on reconnect.
    let wasDown = false;
    es.onerror = () => {
      wasDown = true;
    };
    es.onopen = () => {
      if (wasDown) qc.invalidateQueries();
      wasDown = false;
    };
    return () => es.close();
  }, [enabled, qc]);
}
