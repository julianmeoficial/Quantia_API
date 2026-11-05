import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatGeneralErrorCode } from '@quantia/contracts';

/** HTTP errors carrying a stable `code` (rendered by HttpExceptionFilter). */
export const ChatErrors = {
  disabled: () =>
    new NotFoundException({
      message: 'Chat General is not enabled',
      code: ChatGeneralErrorCode.CHAT_DISABLED,
    }),
  avatarRequired: () =>
    new ForbiddenException({
      message: 'Choose an avatar before using the chat',
      code: ChatGeneralErrorCode.AVATAR_REQUIRED,
    }),
  unauthorized: () =>
    new ForbiddenException({
      message: 'User is not allowed to chat',
      code: ChatGeneralErrorCode.UNAUTHORIZED,
    }),
  messageNotFound: () =>
    new NotFoundException({
      message: 'Message not found',
      code: ChatGeneralErrorCode.MESSAGE_NOT_FOUND,
    }),
  replyTargetNotFound: () =>
    new BadRequestException({
      message: 'replyToId does not reference a live message',
      code: ChatGeneralErrorCode.REPLY_TARGET_NOT_FOUND,
    }),
  notAuthor: () =>
    new ForbiddenException({
      message: 'Only the author can do this',
      code: ChatGeneralErrorCode.NOT_MESSAGE_AUTHOR,
    }),
  editWindowExpired: () =>
    new ForbiddenException({
      message: 'The edit window for this message has expired',
      code: ChatGeneralErrorCode.EDIT_WINDOW_EXPIRED,
    }),
  invalid: (message: string) =>
    new BadRequestException({
      message,
      code: ChatGeneralErrorCode.INVALID_PAYLOAD,
    }),
};
