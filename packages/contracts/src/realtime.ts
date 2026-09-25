import { z } from 'zod';
import { chatGeneralEventSchema } from './chat-general';
import { ProjectStatus } from './projects';
import { taskPrioritySchema, taskStatusSchema } from './tasks';

/** Canonical Socket.io event names (RF-12 / RF-13). */
export const RealtimeEvent = {
  TAREA_ACTUALIZADA: 'tarea.actualizada',
  AVANCE_REGISTRADO: 'avance.registrado',
  PROYECTO_RETRASADO: 'proyecto.retrasado',
  PRESUPUESTO_EJECUCION_BAJA: 'presupuesto.ejecucion-baja',
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const realtimeEventSchema = z.enum([
  RealtimeEvent.TAREA_ACTUALIZADA,
  RealtimeEvent.AVANCE_REGISTRADO,
  RealtimeEvent.PROYECTO_RETRASADO,
  RealtimeEvent.PRESUPUESTO_EJECUCION_BAJA,
]);

export const RealtimeNamespace = {
  PROJECTS: '/projects',
  NOTIFICATIONS: '/notifications',
  GENERAL: '/general',
} as const;
export type RealtimeNamespace =
  (typeof RealtimeNamespace)[keyof typeof RealtimeNamespace];

export function projectRoom(projectId: string): string {
  return projectId;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export const tareaActualizadaPayloadSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assigneeId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime(),
});
export type TareaActualizadaPayload = z.infer<
  typeof tareaActualizadaPayloadSchema
>;

export const avanceRegistradoPayloadSchema = z.object({
  projectId: z.string().uuid(),
  progressId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  title: z.string(),
  authorId: z.string().uuid(),
  recordedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AvanceRegistradoPayload = z.infer<
  typeof avanceRegistradoPayloadSchema
>;

export const proyectoRetrasadoPayloadSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string(),
  status: z.literal(ProjectStatus.DELAYED),
  endDate: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type ProyectoRetrasadoPayload = z.infer<
  typeof proyectoRetrasadoPayloadSchema
>;

export const presupuestoEjecucionBajaPayloadSchema = z.object({
  projectId: z.string().uuid(),
  budgetId: z.string().uuid(),
  executedPercent: z.number().min(0).max(100),
  thresholdPercent: z.number().min(0).max(100),
  updatedAt: z.string().datetime(),
});
export type PresupuestoEjecucionBajaPayload = z.infer<
  typeof presupuestoEjecucionBajaPayloadSchema
>;

export const realtimeEnvelopeSchema = z.object({
  event: z.union([realtimeEventSchema, chatGeneralEventSchema]),
  namespace: z.enum([
    RealtimeNamespace.PROJECTS,
    RealtimeNamespace.NOTIFICATIONS,
    RealtimeNamespace.GENERAL,
  ]),
  room: z.string().min(1),
  payload: z.unknown(),
});
export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;

/** Client → server: join a project room (membership checked server-side). */
export const joinProjectRoomSchema = z.object({
  projectId: z.string().uuid(),
});
export type JoinProjectRoom = z.infer<typeof joinProjectRoomSchema>;
