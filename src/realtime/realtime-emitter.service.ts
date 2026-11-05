import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatGeneralEvent,
  RealtimeEvent,
  RealtimeNamespace,
  generalRoom,
  type AvanceRegistradoPayload,
  type ChatGeneralEscribiendoPayload,
  type ChatGeneralLecturaPayload,
  type ChatGeneralMensajeCreadoPayload,
  type ChatGeneralMensajeEditadoPayload,
  type ChatGeneralMensajeEliminadoPayload,
  type ChatGeneralReaccionesActualizadasPayload,
  type ChatGeneralUsuarioActualizadoPayload,
  type ChatGeneralUsuarioConectadoPayload,
  type ChatGeneralUsuarioDesconectadoPayload,
  type PresupuestoEjecucionBajaPayload,
  type ProyectoRetrasadoPayload,
  type RealtimeEnvelope,
  type TareaActualizadaPayload,
  projectRoom,
  userRoom,
} from '@quantia/contracts';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import { REALTIME_REDIS_CHANNEL } from '../queues/realtime.constants';

@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async emitTareaActualizada(payload: TareaActualizadaPayload): Promise<void> {
    await this.publish({
      event: RealtimeEvent.TAREA_ACTUALIZADA,
      namespace: RealtimeNamespace.PROJECTS,
      room: projectRoom(payload.projectId),
      payload,
    });
  }

  async emitAvanceRegistrado(payload: AvanceRegistradoPayload): Promise<void> {
    await this.publish({
      event: RealtimeEvent.AVANCE_REGISTRADO,
      namespace: RealtimeNamespace.PROJECTS,
      room: projectRoom(payload.projectId),
      payload,
    });
  }

  async emitProyectoRetrasado(
    payload: ProyectoRetrasadoPayload,
  ): Promise<void> {
    await this.publish({
      event: RealtimeEvent.PROYECTO_RETRASADO,
      namespace: RealtimeNamespace.PROJECTS,
      room: projectRoom(payload.projectId),
      payload,
    });
  }

  /** Ready for F5 budget module; also usable from e2e/worker probes. */
  async emitPresupuestoEjecucionBaja(
    payload: PresupuestoEjecucionBajaPayload,
    notifyUserId?: string,
  ): Promise<void> {
    await this.publish({
      event: RealtimeEvent.PRESUPUESTO_EJECUCION_BAJA,
      namespace: RealtimeNamespace.PROJECTS,
      room: projectRoom(payload.projectId),
      payload,
    });
    if (notifyUserId) {
      await this.publish({
        event: RealtimeEvent.PRESUPUESTO_EJECUCION_BAJA,
        namespace: RealtimeNamespace.NOTIFICATIONS,
        room: userRoom(notifyUserId),
        payload,
      });
    }
  }

  async emitChatGeneralMensajeCreado(
    payload: ChatGeneralMensajeCreadoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.MENSAJE_CREADO, payload);
  }

  async emitChatGeneralMensajeEditado(
    payload: ChatGeneralMensajeEditadoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.MENSAJE_EDITADO, payload);
  }

  async emitChatGeneralMensajeEliminado(
    payload: ChatGeneralMensajeEliminadoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.MENSAJE_ELIMINADO, payload);
  }

  async emitChatGeneralReaccionesActualizadas(
    payload: ChatGeneralReaccionesActualizadasPayload,
  ): Promise<void> {
    await this.publishGeneral(
      ChatGeneralEvent.REACCIONES_ACTUALIZADAS,
      payload,
    );
  }

  async emitChatGeneralEscribiendo(
    payload: ChatGeneralEscribiendoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.ESCRIBIENDO, payload);
  }

  async emitChatGeneralLectura(
    payload: ChatGeneralLecturaPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.LECTURA, payload);
  }

  async emitChatGeneralUsuarioActualizado(
    payload: ChatGeneralUsuarioActualizadoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.USUARIO_ACTUALIZADO, payload);
  }

  async emitChatGeneralUsuarioConectado(
    payload: ChatGeneralUsuarioConectadoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.USUARIO_CONECTADO, payload);
  }

  async emitChatGeneralUsuarioDesconectado(
    payload: ChatGeneralUsuarioDesconectadoPayload,
  ): Promise<void> {
    await this.publishGeneral(ChatGeneralEvent.USUARIO_DESCONECTADO, payload);
  }

  private async publishGeneral(
    event: ChatGeneralEvent,
    payload: unknown,
  ): Promise<void> {
    await this.publish({
      event,
      namespace: RealtimeNamespace.GENERAL,
      room: this.generalRoomName(),
      payload,
    });
  }

  private generalRoomName(): string {
    return generalRoom(this.config.get('CHAT_GENERAL_ROOM', { infer: true }));
  }

  async publish(envelope: RealtimeEnvelope): Promise<void> {
    await this.redis.connect();
    const body = JSON.stringify(envelope);
    await this.redis.getClient().publish(REALTIME_REDIS_CHANNEL, body);
    this.logger.debug(
      `Published ${envelope.event} → ${envelope.namespace} room=${envelope.room}`,
    );
  }
}
