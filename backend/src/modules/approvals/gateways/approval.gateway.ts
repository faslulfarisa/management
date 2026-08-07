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

@WebSocketGateway({
  namespace: '/approvals',
  cors: {
    origin: getCorsOriginConfig(),
    credentials: true,
  },
})
export class ApprovalGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ApprovalGateway.name);

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
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe:user')
  handleUserSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    if (data?.userId) {
      client.join(`user:${data.userId}`);
    }
  }

  /** Notify specific user of a new pending item they need to action */
  notifyApprover(userId: string, payload: Record<string, any>) {
    this.server.to(`user:${userId}`).emit('approval:new', payload);
  }

  /** Notify submitter and approvers that a step was advanced */
  broadcastUpdate(tenantId: string, payload: Record<string, any>, targetUserIds?: string[]) {
    if (targetUserIds?.length) {
      for (const uid of targetUserIds) {
        this.server.to(`user:${uid}`).emit('approval:update', payload);
      }
    } else {
      this.server.to(`tenant:${tenantId}`).emit('approval:update', payload);
    }
  }

  /** Notify submitter that the request was fully resolved (approved/rejected/cancelled) */
  broadcastResolved(tenantId: string, payload: Record<string, any>, targetUserIds?: string[]) {
    if (targetUserIds?.length) {
      for (const uid of targetUserIds) {
        this.server.to(`user:${uid}`).emit('approval:resolved', payload);
      }
    } else {
      this.server.to(`tenant:${tenantId}`).emit('approval:resolved', payload);
    }
  }

  /** Push a new persisted notification to its targeted user(s), or tenant-wide if broadcast. */
  broadcastNotification(tenantId: string, payload: Record<string, any>, targetUserIds?: string[]) {
    if (targetUserIds?.length) {
      for (const uid of targetUserIds) {
        this.server.to(`user:${uid}`).emit('notification:new', payload);
      }
    } else {
      this.server.to(`tenant:${tenantId}`).emit('notification:new', payload);
    }
  }
}
