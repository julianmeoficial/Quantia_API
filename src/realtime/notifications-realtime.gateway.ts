import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  RealtimeNamespace,
  userRoom,
  type RealtimeEvent,
} from '@quantia/contracts';
import type { Server, Socket } from 'socket.io';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionLimitService } from './ws-connection-limit.service';

@WebSocketGateway({
  namespace: RealtimeNamespace.NOTIFICATIONS,
  // CORS owned by RedisIoAdapter (CORS_ORIGINS allowlist; never origin: true).
})
export class NotificationsRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly wsLimits: WsConnectionLimitService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.wsAuth.authenticateSocket(client);
      const allowed = await this.wsLimits.tryAcquireConnection(
        user.id,
        client.id,
      );
      if (!allowed) {
        client.emit('error', { message: 'Too many connections' });
        client.disconnect(true);
        return;
      }
      this.wsLimits.setSocketUserId(client, user.id);
      await client.join(userRoom(user.id));
      this.logger.debug(
        `notifications ns connected socket=${client.id} user=${user.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejecting notifications socket ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = this.wsLimits.getSocketUserId(client);
    if (userId) {
      await this.wsLimits.releaseConnection(userId, client.id);
    }
    this.logger.debug(`notifications ns disconnected socket=${client.id}`);
  }

  emitToRoom(room: string, event: RealtimeEvent, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
