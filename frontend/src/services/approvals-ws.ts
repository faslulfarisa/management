'use client';

import { io, Socket } from 'socket.io-client';
import type { ApprovalRequest } from '@/lib/approvals-api';

type ApprovalNewHandler = (payload: Partial<ApprovalRequest>) => void;
type ApprovalUpdateHandler = (payload: Partial<ApprovalRequest>) => void;
type ApprovalResolvedHandler = (payload: Partial<ApprovalRequest>) => void;
type NotificationHandler = (payload: Record<string, any>) => void;
type ConnectionHandler = (connected: boolean) => void;

interface ApprovalsWsOptions {
  accessToken: string;
  tenantId: string;
  userId: string;
  apiUrl?: string;
}

class ApprovalsWebSocketService {
  private socket: Socket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30_000;

  private newHandlers = new Set<ApprovalNewHandler>();
  private updateHandlers = new Set<ApprovalUpdateHandler>();
  private resolvedHandlers = new Set<ApprovalResolvedHandler>();
  private notificationHandlers = new Set<NotificationHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();

  private userId: string | null = null;

  connect(options: ApprovalsWsOptions): void {
    if (this.socket?.connected) return;

    this.userId = options.userId;

    const baseUrl =
      options.apiUrl?.replace('/api/v1', '') ??
      process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ??
      'http://localhost:3001';

    this.socket = io(`${baseUrl}/approvals`, {
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
      this._subscribeUser();
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

    this.socket.on('approval:new', (data: Partial<ApprovalRequest>) => {
      this.newHandlers.forEach((h) => h(data));
    });

    this.socket.on('approval:update', (data: Partial<ApprovalRequest>) => {
      this.updateHandlers.forEach((h) => h(data));
    });

    this.socket.on('approval:resolved', (data: Partial<ApprovalRequest>) => {
      this.resolvedHandlers.forEach((h) => h(data));
    });

    this.socket.on('notification:new', (data: Record<string, any>) => {
      this.notificationHandlers.forEach((h) => h(data));
    });
  }

  disconnect(): void {
    this._stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.userId = null;
    this._notifyConnection(false);
  }

  onNewRequest(handler: ApprovalNewHandler): () => void {
    this.newHandlers.add(handler);
    return () => this.newHandlers.delete(handler);
  }

  onUpdate(handler: ApprovalUpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => this.updateHandlers.delete(handler);
  }

  onResolved(handler: ApprovalResolvedHandler): () => void {
    this.resolvedHandlers.add(handler);
    return () => this.resolvedHandlers.delete(handler);
  }

  onNewNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
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

  private _subscribeUser(): void {
    if (this.userId) {
      this.socket?.emit('subscribe:user', { userId: this.userId });
    }
  }

  private _notifyConnection(connected: boolean): void {
    this.connectionHandlers.forEach((h) => h(connected));
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

export const approvalsWs = new ApprovalsWebSocketService();
