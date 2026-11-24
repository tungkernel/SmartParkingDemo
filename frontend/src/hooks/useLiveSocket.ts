import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import type { WsEventMessage } from '../types';

export function resolveLiveSocketUrl(apiBase = API_BASE): string {
  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/ws/live`;
    } catch {
      // Fall back to same-origin location when apiBase is relative
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/live`;
}

const EVENT_QUERY_MAP: Record<string, string[][]> = {
  turn_checked_in: [['turns'], ['slots'], ['cards'], ['overview'], ['alerts']],
  turn_checked_out: [['turns'], ['slots'], ['cards'], ['overview'], ['alerts'], ['transactions']],
  turn_cancelled: [['turns'], ['slots'], ['cards'], ['overview'], ['alerts']],
  slots_updated: [['slots'], ['overview'], ['turns'], ['alerts']],
  infrastructure_updated: [['overview'], ['lots'], ['zones'], ['slots'], ['catalogs']],
  passes_updated: [
    ['passes'],
    ['passes-summary'],
    ['cards'],
    ['alerts'],
    ['overview'],
    ['transactions'],
  ],
};

export function useLiveSocket(enabled: boolean): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let disposed = false;
    let attempt = 0;

    const clearTimers = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || !navigator.onLine) return;
      attempt = Math.min(attempt + 1, 6);
      const baseDelay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      const jitter = Math.floor(Math.random() * 600);
      reconnectTimer = window.setTimeout(() => {
        connect();
      }, baseDelay + jitter);
    };

    const connect = () => {
      if (disposed || !navigator.onLine) return;
      clearTimers();

      const url = resolveLiveSocketUrl();
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        heartbeatTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30_000);
      };

      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(String(msg.data)) as WsEventMessage;
          if (!parsed.event || parsed.event === 'pong' || parsed.event === 'ping') return;
          const keys = EVENT_QUERY_MAP[parsed.event];
          if (keys) {
            keys.forEach((queryKey) => {
              void queryClient.invalidateQueries({ queryKey });
            });
          }
        } catch {
          // Ignore malformed control frames
        }
      };

      ws.onclose = () => {
        clearTimers();
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    const handleOnline = () => {
      attempt = 0;
      connect();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
        attempt = 0;
        connect();
      }
    };

    connect();
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      clearTimers();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      ws?.close();
      setConnected(false);
    };
  }, [enabled, queryClient]);

  return enabled ? connected : false;
}
