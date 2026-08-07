import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

export interface PunchBroadcastDto {
  tenantId: string;
  branchId?: string;
  employeeCode: string;
  timestamp: string;
  punchType: string;
  provider: string;
  deviceId?: string;
  recordId?: string;
}

export interface QueueHealthDto {
  depth: number;
  active: number;
  failed: number;
  workers: number;
  timestamp: string;
}

@WebSocketGateway({
  namespace: '/biometrics',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class BiometricsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(BiometricsGateway.name);

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

  @SubscribeMessage('subscribe:branch')
  handleBranchSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { branchId: string },
  ) {
    if (data?.branchId) {
      client.join(`branch:${data.branchId}`);
    }
  }

  broadcastPunch(payload: PunchBroadcastDto) {
    this.server.to(`tenant:${payload.tenantId}`).emit('punch:new', payload);
    if (payload.branchId) {
      this.server.to(`branch:${payload.branchId}`).emit('punch:new', payload);
    }
  }

  broadcastQueueHealth(tenantId: string, stats: QueueHealthDto) {
    if (tenantId === '*') {
      this.server.emit('queue:health', stats);
    } else {
      this.server.to(`tenant:${tenantId}`).emit('queue:health', stats);
    }
  }

  broadcastAlert(tenantId: string, alert: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit('alert', alert);
  }
}
