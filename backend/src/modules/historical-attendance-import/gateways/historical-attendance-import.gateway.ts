import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { getCorsOriginConfig } from '../../../shared/http-config.util';

@WebSocketGateway({
  namespace: '/historical-attendance-import',
  cors: {
    origin: getCorsOriginConfig(),
    credentials: true,
  },
})
export class HistoricalAttendanceImportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(HistoricalAttendanceImportGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (token) {
      try {
        const payload = this.jwtService.verify(token, {
          secret: this.config.get<string>('JWT_SECRET'),
        });
        client.data.user = payload;
      } catch {
        this.logger.warn(`Client ${client.id}: invalid JWT, disconnecting`);
        client.disconnect(true);
        return;
      }
    }

    const tenantId = client.handshake.auth?.tenantId;
    if (tenantId) {
      client.join(`tenant:${tenantId}`);
      this.logger.log(`Client ${client.id} joined tenant:${tenantId}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe:batch')
  handleBatchSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { batchId: string },
  ) {
    if (data?.batchId) client.join(`batch:${data.batchId}`);
  }

  broadcastProgress(tenantId: string, batchId: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).to(`batch:${batchId}`).emit('import:progress', {
      tenantId,
      batchId,
      ...payload,
      emittedAt: new Date().toISOString(),
    });
  }

  broadcastCompleted(tenantId: string, batchId: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).to(`batch:${batchId}`).emit('import:completed', {
      tenantId,
      batchId,
      ...payload,
      emittedAt: new Date().toISOString(),
    });
  }

  broadcastFailed(tenantId: string, batchId: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).to(`batch:${batchId}`).emit('import:failed', {
      tenantId,
      batchId,
      ...payload,
      emittedAt: new Date().toISOString(),
    });
  }

  broadcastMonitoring(tenantId: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit('import:monitoring', {
      tenantId,
      ...payload,
      emittedAt: new Date().toISOString(),
    });
  }
}
