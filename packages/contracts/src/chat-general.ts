import { z } from 'zod';

/** Hard ceiling for message content (DTO / contract). Service may apply a lower env limit. */
export const CHAT_GENERAL_MESSAGE_HARD_MAX = 4000;

/** Canonical Socket.io event names for Chat General (ENG-171). */
export const ChatGeneralEvent = {
  PRESENCIA: 'chat.general.presencia',
  USUARIO_CONECTADO: 'chat.general.usuario-conectado',
  USUARIO_DESCONECTADO: 'chat.general.usuario-desconectado',
  MENSAJE_CREADO: 'chat.general.mensaje-creado',
} as const;
export type ChatGeneralEvent =
  (typeof ChatGeneralEvent)[keyof typeof ChatGeneralEvent];

export const chatGeneralEventSchema = z.enum([
  ChatGeneralEvent.PRESENCIA,
  ChatGeneralEvent.USUARIO_CONECTADO,
  ChatGeneralEvent.USUARIO_DESCONECTADO,
  ChatGeneralEvent.MENSAJE_CREADO,
]);

/** Public presence card — never email, roles, or tokens. */
export const presenceUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  avatarUrl: z.string().url().nullable(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const generalChatMessageSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(CHAT_GENERAL_MESSAGE_HARD_MAX),
  clientMessageId: z.string().min(1).max(64).nullable(),
  createdAt: z.string().datetime(),
  author: presenceUserSchema,
});
export type GeneralChatMessageDto = z.infer<typeof generalChatMessageSchema>;

export const chatGeneralPresenciaPayloadSchema = z.object({
  users: z.array(presenceUserSchema),
  generatedAt: z.string().datetime(),
});
export type ChatGeneralPresenciaPayload = z.infer<
  typeof chatGeneralPresenciaPayloadSchema
>;

export const chatGeneralUsuarioConectadoPayloadSchema = z.object({
  user: presenceUserSchema,
  occurredAt: z.string().datetime(),
});
export type ChatGeneralUsuarioConectadoPayload = z.infer<
  typeof chatGeneralUsuarioConectadoPayloadSchema
>;

export const chatGeneralUsuarioDesconectadoPayloadSchema = z.object({
  userId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});
export type ChatGeneralUsuarioDesconectadoPayload = z.infer<
  typeof chatGeneralUsuarioDesconectadoPayloadSchema
>;

export const chatGeneralMensajeCreadoPayloadSchema = z.object({
  message: generalChatMessageSchema,
});
export type ChatGeneralMensajeCreadoPayload = z.infer<
  typeof chatGeneralMensajeCreadoPayloadSchema
>;

export const createGeneralChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(CHAT_GENERAL_MESSAGE_HARD_MAX),
  clientMessageId: z.string().min(1).max(64).optional(),
});
export type CreateGeneralChatMessage = z.infer<
  typeof createGeneralChatMessageSchema
>;

export const generalChatHistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type GeneralChatHistoryQuery = z.infer<
  typeof generalChatHistoryQuerySchema
>;

export const generalChatHistoryResponseSchema = z.object({
  items: z.array(generalChatMessageSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type GeneralChatHistoryResponse = z.infer<
  typeof generalChatHistoryResponseSchema
>;

/** Fixed room name helper (default room is `general`). */
export function generalRoom(name = 'general'): string {
  return name;
}
