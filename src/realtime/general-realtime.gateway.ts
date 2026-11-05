import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ChatGeneralClientEvent,
  ChatGeneralErrorCode,
  ChatGeneralEvent,
  RealtimeNamespace,
  chatGeneralEscribiendoRequestSchema,
  chatGeneralReautenticarRequestSchema,
  generalRoom,
  type ChatGeneralAck,
  type ChatGeneralSocketError,
  type PresenceUser,
} from '@quantia/contracts';
import type { Server, Socket } from 'socket.io';
import type { EnvConfig } from '../config/env.schema';
import { ChatGeneralPresenceService } from './chat-general-presence.service';
import { WsAuthService, type WsAuthenticatedUser } from './ws-auth.service';
import { WsConnectionLimitService } from './ws-connection-limit.service';

/**
 * `/general` — Chat General.
 *
 * Handshake: JWT (`auth.token`) → active user → avatar chosen → socket cap.
 * Failures emit `error` `{ code, message }` and disconnect; the chat is
 * ready when the client receives `chat.general.presencia`.
 *
 * Client → server: `chat.general.escribiendo` and `chat.general.reautenticar`
 * (both acked). Messages are written over REST.
 *
 * The socket is closed at JWT `exp` + CHAT_GENERAL_TOKEN_GRACE_SECONDS unless
 * the client re-authenticates in-band, so revoked/expired sessions stop
 * receiving messages without a presence flicker for well-behaved clients.
 */
@WebSocketGateway({
  namespace: RealtimeNamespace.GENERAL,
  // CORS owned by RedisIoAdapter (CORS_ORIGINS allowlist; never origin: true).
})
export class GeneralRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(GeneralRealtimeGateway.name);
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly wsLimits: WsConnectionLimitService,
    private readonly presence: ChatGeneralPresenceService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
  }

  private roomName(): string {
    return generalRoom(this.config.get('CHAT_GENERAL_ROOM', { infer: true }));
  }

  private reject(client: Socket, code: string, message: string): void {
    const payload: ChatGeneralSocketError = { code, message };
    client.emit('error', payload);
    client.disconnect(true);
  }

  async handleConnection(client: Socket): Promise<void> {
    if (!this.config.get('CHAT_GENERAL_ENABLED', { infer: true })) {
      this.reject(
        client,
        ChatGeneralErrorCode.CHAT_DISABLED,
        'Chat General is not enabled',
      );
      return;
    }

    let user: WsAuthenticatedUser;
    try {
      user = await this.wsAuth.authenticateSocket(client);
    } catch (error) {
      this.logger.warn(
        `Rejecting general socket ${client.id}: ${(error as Error).message}`,
      );
      this.reject(client, ChatGeneralErrorCode.UNAUTHORIZED, 'Unauthorized');
      return;
    }

    if (!user.avatar) {
      this.reject(
        client,
        ChatGeneralErrorCode.AVATAR_REQUIRED,
        'Choose an avatar before using the chat',
      );
      return;
    }

    try {
      const allowed = await this.wsLimits.tryAcquireConnection(
        user.id,
        client.id,
      );
      if (!allowed) {
        this.reject(
          client,
          ChatGeneralErrorCode.TOO_MANY_CONNECTIONS,
          'Too many connections',
        );
        return;
      }
      this.wsLimits.setSocketUserId(client, user.id);

      await client.join(this.roomName());
      await this.presence.join(user.id, client.id);
      const tokenExpiresAt = this.scheduleExpiry(client, user);

      const snapshot =
        await this.presence.buildPresenceSnapshot(tokenExpiresAt);
      client.emit(ChatGeneralEvent.PRESENCIA, snapshot);

      this.logger.debug(
        `general ns connected socket=${client.id} user=${user.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `General socket setup failed ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.clearExpiry(client.id);
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

  /** `{ isTyping }` — send true every ~TTL/2 while typing, false on stop/send. */
  @SubscribeMessage(ChatGeneralClientEvent.ESCRIBIENDO)
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<ChatGeneralAck> {
    if (!(await this.wsLimits.assertEventAllowed(client.id))) {
      return this.nack(ChatGeneralErrorCode.RATE_LIMITED, 'Too many events');
    }
    const parsed = chatGeneralEscribiendoRequestSchema.safeParse(body);
    if (!parsed.success) {
      return this.nack(
        ChatGeneralErrorCode.INVALID_PAYLOAD,
        'Expected { isTyping: boolean }',
      );
    }
    let user: WsAuthenticatedUser;
    try {
      user = this.wsAuth.getUser(client);
    } catch {
      return this.nack(ChatGeneralErrorCode.UNAUTHORIZED, 'Unauthorized');
    }
    const card = this.toPresenceUser(user);
    if (parsed.data.isTyping) {
      await this.presence.startTyping(card);
    } else {
      await this.presence.stopTyping(card);
    }
    return { ok: true };
  }

  /** `{ token }` — call after every refresh so the socket outlives the old JWT. */
  @SubscribeMessage(ChatGeneralClientEvent.REAUTENTICAR)
  async handleReauth(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<ChatGeneralAck> {
    if (!(await this.wsLimits.assertEventAllowed(client.id))) {
      return this.nack(ChatGeneralErrorCode.RATE_LIMITED, 'Too many events');
    }
    const parsed = chatGeneralReautenticarRequestSchema.safeParse(body);
    if (!parsed.success) {
      return this.nack(
        ChatGeneralErrorCode.INVALID_PAYLOAD,
        'Expected { token: string }',
      );
    }
    const current = this.wsLimits.getSocketUserId(client);
    try {
      const user = await this.wsAuth.verifyAccessToken(parsed.data.token);
      if (user.id !== current) {
        return this.nack(
          ChatGeneralErrorCode.UNAUTHORIZED,
          'Token belongs to another user',
        );
      }
      this.wsAuth.setUser(client, user);
      const tokenExpiresAt = this.scheduleExpiry(client, user);
      return { ok: true, tokenExpiresAt };
    } catch {
      return this.nack(ChatGeneralErrorCode.UNAUTHORIZED, 'Invalid token');
    }
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }

  private toPresenceUser(user: WsAuthenticatedUser): PresenceUser {
    return {
      id: user.id,
      name: user.fullName,
      avatar: user.avatar,
      avatarUrl: null,
    };
  }

  private nack(code: string, error: string): ChatGeneralAck {
    return { ok: false, code, error };
  }

  /** Returns the ISO instant the token expires (null when it has no `exp`). */
  private scheduleExpiry(
    client: Socket,
    user: WsAuthenticatedUser,
  ): string | null {
    this.clearExpiry(client.id);
    if (!user.tokenExp) return null;
    const graceMs =
      this.config.get('CHAT_GENERAL_TOKEN_GRACE_SECONDS', { infer: true }) *
      1000;
    const expMs = user.tokenExp * 1000;
    const delay = Math.max(0, expMs + graceMs - Date.now());
    const timer = setTimeout(() => {
      this.expiryTimers.delete(client.id);
      this.reject(
        client,
        ChatGeneralErrorCode.TOKEN_EXPIRED,
        'Access token expired; reconnect with a fresh token',
      );
    }, delay);
    timer.unref?.();
    this.expiryTimers.set(client.id, timer);
    return new Date(expMs).toISOString();
  }

  private clearExpiry(socketId: string): void {
    const timer = this.expiryTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(socketId);
    }
  }
}
