'use client';

import { io, Socket } from 'socket.io-client';
import type { PunchBroadcast, QueueHealthSnapshot, BiometricsAlert } from '@/types/biometrics';

type PunchHandler = (event: PunchBroadcast) => void;
type QueueHealthHandler = (snapshot: QueueHealthSnapshot) => void;
type AlertHandler = (alert: BiometricsAlert) => void;
type ConnectionHandler = (connected: boolean) => void;

interface BiometricsWsOptions {
  accessToken: string;
  tenantId: string;
  apiUrl?: string;
}

class BiometricsWebSocketService {
  private socket: Socket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30_000;

  private punchHandlers = new Set<PunchHandler>();
  private queueHealthHandlers = new Set<QueueHealthHandler>();
  private alertHandlers = new Set<AlertHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();

  private subscribedBranches = new Set<string>();

  connect(options: BiometricsWsOptions): void {
    if (this.socket?.connected) return;

    const baseUrl =
      options.apiUrl?.replace('/api/v1', '') ??
      process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ??
      'http://localhost:3001';

    this.socket = io(`${baseUrl}/biometrics`, {
      auth: { token: options.accessToken, tenantId: options.tenantId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: this.MAX_RECONNECT_DELAY,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this._notifyConnection(true);
      this._resubscribeBranches();
      this._startHeartbeat();
    });

    this.socket.on('disconnect', () => {
      this._notifyConnection(false);
      this._stopHeartbeat();
    });

    this.socket.on('connect_error', () => {
      this.reconnectAttempts++;
      this._notifyConnection(false);
    });

    this.socket.on('punch:new', (data: PunchBroadcast) => {
      this.punchHandlers.forEach((h) => h(data));
    });

    this.socket.on('queue:health', (data: QueueHealthSnapshot) => {
      this.queueHealthHandlers.forEach((h) => h(data));
    });

    this.socket.on('alert', (data: BiometricsAlert) => {
      this.alertHandlers.forEach((h) => h(data));
    });
  }

  disconnect(): void {
    this._stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this._notifyConnection(false);
  }

  subscribeBranch(branchId: string): void {
    this.subscribedBranches.add(branchId);
    if (this.socket?.connected) {
      this.socket.emit('subscribe:branch', { branchId });
    }
  }

  unsubscribeBranch(branchId: string): void {
    this.subscribedBranches.delete(branchId);
  }

  onPunch(handler: PunchHandler): () => void {
    this.punchHandlers.add(handler);
    return () => this.punchHandlers.delete(handler);
  }

  onQueueHealth(handler: QueueHealthHandler): () => void {
    this.queueHealthHandlers.add(handler);
    return () => this.queueHealthHandlers.delete(handler);
  }

  onAlert(handler: AlertHandler): () => void {
    this.alertHandlers.add(handler);
    return () => this.alertHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get reconnectCount(): number {
    return this.reconnectAttempts;
  }

  private _notifyConnection(connected: boolean): void {
    this.connectionHandlers.forEach((h) => h(connected));
  }

  private _resubscribeBranches(): void {
    this.subscribedBranches.forEach((branchId) => {
      this.socket?.emit('subscribe:branch', { branchId });
    });
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, 25_000);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// Module-level singleton — shared across all components that import this file.
// Exported as a value (not a class) so tree-shaking preserves it correctly in
// the client bundle and tests can import it without instantiation.
export const biometricsWs = new BiometricsWebSocketService();
