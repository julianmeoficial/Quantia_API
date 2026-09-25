import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { RealtimeNamespace, joinProjectRoomSchema } from '@quantia/contracts';
import type { Server, Socket } from 'socket.io';
import { ProjectAccessService } from '../common/project-access.service';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionLimitService } from './ws-connection-limit.service';

@WebSocketGateway({
  namespace: RealtimeNamespace.PROJECTS,
  // CORS owned by RedisIoAdapter (CORS_ORIGINS allowlist; never origin: true).
})
export class ProjectsRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ProjectsRealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly projectAccess: ProjectAccessService,
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
      this.logger.debug(
        `projects ns connected socket=${client.id} user=${user.id}`,
      );
      client.emit('authenticated', { userId: user.id });
    } catch (error) {
      this.logger.warn(
        `Rejecting projects socket ${client.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = this.wsLimits.getSocketUserId(client);
    if (userId) {
      await this.wsLimits.releaseConnection(userId, client.id);
    }
    this.logger.debug(`projects ns disconnected socket=${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: true; room: string } | { ok: false; error: string }> {
    if (!(await this.wsLimits.assertEventAllowed(client.id))) {
      return { ok: false, error: 'Event rate limit exceeded' };
    }

    const parsed = joinProjectRoomSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid join payload' };
    }

    try {
      const user = this.wsAuth.getUser(client);
      await this.projectAccess.assertCanAccessProject(
        user,
        parsed.data.projectId,
      );
      await client.join(parsed.data.projectId);
      client.emit('joined', { room: parsed.data.projectId });
      return { ok: true, room: parsed.data.projectId };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message || 'Join denied',
      };
    }
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
