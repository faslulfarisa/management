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
import { getCorsOriginConfig } from '../../../shared/http-config.util';
import { DatabaseService } from '../../../shared/database.service';

export interface PunchBroadcastDto {
  tenantId: string;
  branchId?: string;
  employeeCode: string;
  timestamp: string;
  punchType: string;
  verifyMethod?: string;
  attendanceSource?: string;
  provider: string;
  deviceId?: string;
  terminalId?: string;
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
    origin: getCorsOriginConfig(),
    credentials: true,
  },
})
export class BiometricsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(BiometricsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token) {
      this.logger.warn(`Client ${client.id}: missing JWT, disconnecting`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      const tokenTenantId = payload.tenant_id ?? payload.tenantId;
      const requestedTenantId = client.handshake.auth?.tenantId;

      if (!tokenTenantId || (requestedTenantId && requestedTenantId !== tokenTenantId)) {
        this.logger.warn(`Client ${client.id}: invalid tenant subscription, disconnecting`);
        client.disconnect(true);
        return;
      }

      client.data.user = payload;
      client.data.tenantId = tokenTenantId;
      client.join(`tenant:${tokenTenantId}`);
      this.logger.log(`Client ${client.id} joined tenant:${tokenTenantId}`);
    } catch {
      this.logger.warn(`Client ${client.id}: invalid JWT, disconnecting`);
      client.disconnect(true);
      return;
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe:branch')
  async handleBranchSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { branchId: string },
  ) {
    const tenantId = client.data.tenantId;
    if (!tenantId || !data?.branchId) return;

    const { rows } = await this.db.query(
      `SELECT 1
       FROM branches
       WHERE id = $1
         AND tenant_id = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [data.branchId, tenantId],
    );

    if (rows[0]) {
      client.join(`tenant:${tenantId}:branch:${data.branchId}`);
    }
  }

  broadcastPunch(payload: PunchBroadcastDto) {
    this.server.to(`tenant:${payload.tenantId}`).emit('punch:new', payload);
    if (payload.branchId) {
      this.server.to(`tenant:${payload.tenantId}:branch:${payload.branchId}`).emit('punch:new', payload);
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
