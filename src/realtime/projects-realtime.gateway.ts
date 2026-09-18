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
import {
  RealtimeNamespace,
  joinProjectRoomSchema,
  type RealtimeEvent,
} from '@quantia/contracts';
import type { Server, Socket } from 'socket.io';
import { ProjectAccessService } from '../common/project-access.service';
import { WsAuthService } from './ws-auth.service';

@WebSocketGateway({
  namespace: RealtimeNamespace.PROJECTS,
  cors: { origin: true, credentials: true },
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
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.wsAuth.authenticateSocket(client);
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

  handleDisconnect(client: Socket): void {
    this.logger.debug(`projects ns disconnected socket=${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: true; room: string } | { ok: false; error: string }> {
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

  emitToRoom(room: string, event: RealtimeEvent, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }
}
