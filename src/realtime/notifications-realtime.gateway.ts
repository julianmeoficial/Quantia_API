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

  constructor(private readonly wsAuth: WsAuthService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.wsAuth.authenticateSocket(client);
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

  handleDisconnect(client: Socket): void {
    this.logger.debug(`notifications ns disconnected socket=${client.id}`);
  }

  emitToRoom(room: string, event: RealtimeEvent, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
