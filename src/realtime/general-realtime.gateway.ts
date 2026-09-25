import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ChatGeneralEvent,
  RealtimeNamespace,
  generalRoom,
} from '@quantia/contracts';
import type { Server, Socket } from 'socket.io';
import type { EnvConfig } from '../config/env.schema';
import { ChatGeneralPresenceService } from './chat-general-presence.service';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionLimitService } from './ws-connection-limit.service';

@WebSocketGateway({
  namespace: RealtimeNamespace.GENERAL,
  // CORS owned by RedisIoAdapter (CORS_ORIGINS allowlist; never origin: true).
})
export class GeneralRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GeneralRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly wsLimits: WsConnectionLimitService,
    private readonly presence: ChatGeneralPresenceService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private roomName(): string {
    return generalRoom(this.config.get('CHAT_GENERAL_ROOM', { infer: true }));
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      if (!this.config.get('CHAT_GENERAL_ENABLED', { infer: true })) {
        client.emit('error', { message: 'Chat General is not enabled' });
        client.disconnect(true);
        return;
      }

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

      const room = this.roomName();
      await client.join(room);
      await this.presence.join(user.id, client.id);

      const snapshot = await this.presence.buildPresenceSnapshot();
      client.emit(ChatGeneralEvent.PRESENCIA, snapshot);

      this.logger.debug(
        `general ns connected socket=${client.id} user=${user.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Rejecting general socket ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = this.wsLimits.getSocketUserId(client);
    if (userId) {
      try {
        await this.presence.leave(userId, client.id);
      } catch (error) {
        this.logger.warn(
          `Presence leave failed socket=${client.id}: ${(error as Error).message}`,
        );
      }
      await this.wsLimits.releaseConnection(userId, client.id);
    }
    this.logger.debug(`general ns disconnected socket=${client.id}`);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
