import { z } from 'zod';
import { avatarKeySchema } from './avatars';

/** Hard ceiling for message content (DTO / contract). Service may apply a lower env limit. */
export const CHAT_GENERAL_MESSAGE_HARD_MAX = 4000;

/** Characters of the parent message copied into a reply preview. */
export const CHAT_GENERAL_REPLY_EXCERPT_MAX = 120;

/** Reaction allowlist (Telegram-style quick reactions). One per user per message. */
export const CHAT_GENERAL_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
  '🔥',
  '🎉',
] as const;
export type ChatGeneralReaction = (typeof CHAT_GENERAL_REACTIONS)[number];
export const chatGeneralReactionSchema = z.enum(CHAT_GENERAL_REACTIONS);

/** Server → client Socket.io events on `/general`. */
export const ChatGeneralEvent = {
  PRESENCIA: 'chat.general.presencia',
  USUARIO_CONECTADO: 'chat.general.usuario-conectado',
  USUARIO_DESCONECTADO: 'chat.general.usuario-desconectado',
  USUARIO_ACTUALIZADO: 'chat.general.usuario-actualizado',
  MENSAJE_CREADO: 'chat.general.mensaje-creado',
  MENSAJE_EDITADO: 'chat.general.mensaje-editado',
  MENSAJE_ELIMINADO: 'chat.general.mensaje-eliminado',
  REACCIONES_ACTUALIZADAS: 'chat.general.reacciones-actualizadas',
  ESCRIBIENDO: 'chat.general.escribiendo',
  LECTURA: 'chat.general.lectura',
} as const;
export type ChatGeneralEvent =
  (typeof ChatGeneralEvent)[keyof typeof ChatGeneralEvent];

export const chatGeneralEventSchema = z.enum([
  ChatGeneralEvent.PRESENCIA,
  ChatGeneralEvent.USUARIO_CONECTADO,
  ChatGeneralEvent.USUARIO_DESCONECTADO,
  ChatGeneralEvent.USUARIO_ACTUALIZADO,
  ChatGeneralEvent.MENSAJE_CREADO,
  ChatGeneralEvent.MENSAJE_EDITADO,
  ChatGeneralEvent.MENSAJE_ELIMINADO,
  ChatGeneralEvent.REACCIONES_ACTUALIZADAS,
  ChatGeneralEvent.ESCRIBIENDO,
  ChatGeneralEvent.LECTURA,
]);

/** Client → server Socket.io events on `/general` (all support an ack callback). */
export const ChatGeneralClientEvent = {
  ESCRIBIENDO: 'chat.general.escribiendo',
  REAUTENTICAR: 'chat.general.reautenticar',
} as const;
export type ChatGeneralClientEvent =
  (typeof ChatGeneralClientEvent)[keyof typeof ChatGeneralClientEvent];

/** Stable machine-readable codes (HTTP body `code` and socket `error.code`). */
export const ChatGeneralErrorCode = {
  CHAT_DISABLED: 'CHAT_DISABLED',
  AVATAR_REQUIRED: 'AVATAR_REQUIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOO_MANY_CONNECTIONS: 'TOO_MANY_CONNECTIONS',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  REPLY_TARGET_NOT_FOUND: 'REPLY_TARGET_NOT_FOUND',
  NOT_MESSAGE_AUTHOR: 'NOT_MESSAGE_AUTHOR',
  EDIT_WINDOW_EXPIRED: 'EDIT_WINDOW_EXPIRED',
} as const;
export type ChatGeneralErrorCode =
  (typeof ChatGeneralErrorCode)[keyof typeof ChatGeneralErrorCode];

export const chatGeneralSocketErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ChatGeneralSocketError = z.infer<
  typeof chatGeneralSocketErrorSchema
>;

/** Public presence card — never email, roles, or tokens. */
export const presenceUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  /** One of the 5 predefined avatars. */
  avatar: avatarKeySchema.nullable(),
  /** @deprecated Always `null`: photo uploads are not supported. Use `avatar`. */
  avatarUrl: z.string().url().nullable(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const generalChatReplyPreviewSchema = z.object({
  id: z.string().uuid(),
  seq: z.number().int().positive(),
  author: presenceUserSchema,
  /** First characters of the parent; `null` once the parent is deleted. */
  excerpt: z.string().max(CHAT_GENERAL_REPLY_EXCERPT_MAX).nullable(),
  deleted: z.boolean(),
});
export type GeneralChatReplyPreview = z.infer<
  typeof generalChatReplyPreviewSchema
>;

export const generalChatReactionSummarySchema = z.object({
  emoji: chatGeneralReactionSchema,
  count: z.number().int().positive(),
  /** Who reacted (lets clients compute "reacted by me" and tooltips). */
  userIds: z.array(z.string().uuid()),
});
export type GeneralChatReactionSummary = z.infer<
  typeof generalChatReactionSummarySchema
>;

export const generalChatMessageSchema = z.object({
  id: z.string().uuid(),
  /** Monotonic server order. Sort by `seq`, never by client clocks. */
  seq: z.number().int().positive(),
  /** Increments on every change; when merging keep the highest version. */
  version: z.number().int().positive(),
  /** Empty string when `deletedAt` is set (tombstone). */
  content: z.string().max(CHAT_GENERAL_MESSAGE_HARD_MAX),
  clientMessageId: z.string().min(1).max(64).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  author: presenceUserSchema,
  replyTo: generalChatReplyPreviewSchema.nullable(),
  reactions: z.array(generalChatReactionSummarySchema),
});
export type GeneralChatMessageDto = z.infer<typeof generalChatMessageSchema>;

// ---------- Socket payloads (server → client) ----------

export const chatGeneralPresenciaPayloadSchema = z.object({
  users: z.array(presenceUserSchema),
  generatedAt: z.string().datetime(),
  /** Users currently typing (so late joiners see the indicator). */
  typing: z.array(presenceUserSchema),
  /** When this socket's access token stops being accepted. */
  tokenExpiresAt: z.string().datetime().nullable(),
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
  /** Telegram-style "last seen" (same instant as `occurredAt`). */
  lastSeenAt: z.string().datetime(),
});
export type ChatGeneralUsuarioDesconectadoPayload = z.infer<
  typeof chatGeneralUsuarioDesconectadoPayloadSchema
>;

export const chatGeneralUsuarioActualizadoPayloadSchema = z.object({
  user: presenceUserSchema,
  occurredAt: z.string().datetime(),
});
export type ChatGeneralUsuarioActualizadoPayload = z.infer<
  typeof chatGeneralUsuarioActualizadoPayloadSchema
>;

export const chatGeneralMensajeCreadoPayloadSchema = z.object({
  message: generalChatMessageSchema,
});
export type ChatGeneralMensajeCreadoPayload = z.infer<
  typeof chatGeneralMensajeCreadoPayloadSchema
>;

export const chatGeneralMensajeEditadoPayloadSchema = z.object({
  message: generalChatMessageSchema,
});
export type ChatGeneralMensajeEditadoPayload = z.infer<
  typeof chatGeneralMensajeEditadoPayloadSchema
>;

export const chatGeneralMensajeEliminadoPayloadSchema = z.object({
  id: z.string().uuid(),
  seq: z.number().int().positive(),
  version: z.number().int().positive(),
  deletedAt: z.string().datetime(),
  /** True when an ADMINISTRADOR removed someone else's message. */
  byModerator: z.boolean(),
});
export type ChatGeneralMensajeEliminadoPayload = z.infer<
  typeof chatGeneralMensajeEliminadoPayloadSchema
>;

export const chatGeneralReaccionesActualizadasPayloadSchema = z.object({
  messageId: z.string().uuid(),
  seq: z.number().int().positive(),
  version: z.number().int().positive(),
  reactions: z.array(generalChatReactionSummarySchema),
  /** Who triggered the change and what they did (for a pop animation). */
  actorId: z.string().uuid(),
  emoji: chatGeneralReactionSchema.nullable(),
});
export type ChatGeneralReaccionesActualizadasPayload = z.infer<
  typeof chatGeneralReaccionesActualizadasPayloadSchema
>;

export const chatGeneralEscribiendoPayloadSchema = z.object({
  user: presenceUserSchema,
  isTyping: z.boolean(),
  /** Hide the indicator after this long without a refresh. */
  expiresInMs: z.number().int().nonnegative(),
});
export type ChatGeneralEscribiendoPayload = z.infer<
  typeof chatGeneralEscribiendoPayloadSchema
>;

export const chatGeneralLecturaPayloadSchema = z.object({
  userId: z.string().uuid(),
  lastReadSeq: z.number().int().nonnegative(),
  readAt: z.string().datetime(),
});
export type ChatGeneralLecturaPayload = z.infer<
  typeof chatGeneralLecturaPayloadSchema
>;

// ---------- Socket payloads (client → server) ----------

export const chatGeneralEscribiendoRequestSchema = z.object({
  isTyping: z.boolean(),
});
export type ChatGeneralEscribiendoRequest = z.infer<
  typeof chatGeneralEscribiendoRequestSchema
>;

export const chatGeneralReautenticarRequestSchema = z.object({
  token: z.string().min(1),
});
export type ChatGeneralReautenticarRequest = z.infer<
  typeof chatGeneralReautenticarRequestSchema
>;

export const chatGeneralAckSchema = z.union([
  z.object({
    ok: z.literal(true),
    tokenExpiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({ ok: z.literal(false), code: z.string(), error: z.string() }),
]);
export type ChatGeneralAck = z.infer<typeof chatGeneralAckSchema>;

// ---------- REST ----------

export const createGeneralChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(CHAT_GENERAL_MESSAGE_HARD_MAX),
  clientMessageId: z.string().min(1).max(64).optional(),
  replyToId: z.string().uuid().optional(),
});
export type CreateGeneralChatMessage = z.infer<
  typeof createGeneralChatMessageSchema
>;

export const editGeneralChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(CHAT_GENERAL_MESSAGE_HARD_MAX),
});
export type EditGeneralChatMessage = z.infer<
  typeof editGeneralChatMessageSchema
>;

export const setGeneralChatReactionSchema = z.object({
  emoji: chatGeneralReactionSchema,
});
export type SetGeneralChatReaction = z.infer<
  typeof setGeneralChatReactionSchema
>;

export const markGeneralChatReadSchema = z.object({
  lastReadSeq: z.number().int().nonnegative(),
});
export type MarkGeneralChatRead = z.infer<typeof markGeneralChatReadSchema>;

export const markGeneralChatReadResponseSchema = z.object({
  lastReadSeq: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type MarkGeneralChatReadResponse = z.infer<
  typeof markGeneralChatReadResponseSchema
>;

/** `POST` / `PATCH` / reaction responses. */
export const generalChatMessageEnvelopeSchema = z.object({
  message: generalChatMessageSchema,
});
export type GeneralChatMessageEnvelope = z.infer<
  typeof generalChatMessageEnvelopeSchema
>;

export const generalChatHistoryQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type GeneralChatHistoryQuery = z.infer<
  typeof generalChatHistoryQuerySchema
>;

export const generalChatHistoryResponseSchema = z.object({
  /** Newest first (descending `seq`). Deleted messages are omitted. */
  items: z.array(generalChatMessageSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type GeneralChatHistoryResponse = z.infer<
  typeof generalChatHistoryResponseSchema
>;

export const generalChatUpdatesQuerySchema = z.object({
  since: z.string().datetime().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type GeneralChatUpdatesQuery = z.infer<
  typeof generalChatUpdatesQuerySchema
>;

export const generalChatUpdatesResponseSchema = z.object({
  /** Every message created/edited/deleted/reacted after `since`, oldest change first. Includes tombstones. */
  items: z.array(generalChatMessageSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  /** Use as the next `since` once `hasMore` is false. */
  serverTime: z.string().datetime(),
});
export type GeneralChatUpdatesResponse = z.infer<
  typeof generalChatUpdatesResponseSchema
>;

export const generalChatReadStateSchema = z.object({
  userId: z.string().uuid(),
  lastReadSeq: z.number().int().nonnegative(),
});
export type GeneralChatReadState = z.infer<typeof generalChatReadStateSchema>;

export const generalChatStateResponseSchema = z.object({
  serverTime: z.string().datetime(),
  latestSeq: z.number().int().nonnegative(),
  lastReadSeq: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  /** Read pointers of every active user ("seen by" ticks). */
  readStates: z.array(generalChatReadStateSchema),
  limits: z.object({
    messageMaxLength: z.number().int().positive(),
    editWindowSeconds: z.number().int().nonnegative(),
    typingTtlMs: z.number().int().positive(),
    historyMaxLimit: z.number().int().positive(),
  }),
  reactions: z.array(chatGeneralReactionSchema),
});
export type GeneralChatStateResponse = z.infer<
  typeof generalChatStateResponseSchema
>;

/** Fixed room name helper (default room is `general`). */
export function generalRoom(name = 'general'): string {
  return name;
}
