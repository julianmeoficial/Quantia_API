import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ChatGeneralService } from './chat-general.service';
import {
  CreateGeneralChatMessageDto,
  EditGeneralChatMessageDto,
  GeneralChatHistoryResponseDto,
  GeneralChatMessageEnvelopeDto,
  GeneralChatUpdatesResponseDto,
  ListGeneralChatMessagesQueryDto,
  ListGeneralChatUpdatesQueryDto,
  MarkGeneralChatReadDto,
  MarkGeneralChatReadResponseDto,
  SetGeneralChatReactionDto,
} from './dto/chat-general.dto';

/**
 * Chat General REST. Every route requires JWT, CHAT_GENERAL_ENABLED and an
 * avatar (403 `AVATAR_REQUIRED` otherwise). Writes are REST; the socket only
 * pushes events (+ typing).
 */
@ApiTags('chat-general')
@ApiBearerAuth()
@Controller({ path: 'chat/general', version: '1' })
export class ChatGeneralController {
  constructor(private readonly chatGeneralService: ChatGeneralService) {}

  @Post('messages')
  /** Skip default/auth/reports so only the named `chat-general` throttler applies. */
  @SkipThrottle({ default: true, auth: true, reports: true })
  @ApiOperation({
    summary: 'Send a message (optionally replying to another)',
    description:
      '201 on create, 200 on idempotent replay with the same clientMessageId. Emits chat.general.mensaje-creado.',
  })
  @ApiCreatedResponse({ type: GeneralChatMessageEnvelopeDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGeneralChatMessageDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.chatGeneralService.create(user, dto);
    res.status(result.created ? 201 : 200);
    return { message: result.message };
  }

  @Get('messages')
  @ApiOperation({ summary: 'History, newest first (cursor pagination)' })
  @ApiOkResponse({ type: GeneralChatHistoryResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListGeneralChatMessagesQueryDto,
  ) {
    return this.chatGeneralService.listHistory(user, query);
  }

  @Patch('messages/:messageId')
  @SkipThrottle({ default: true, auth: true, reports: true })
  @ApiOperation({
    summary: 'Edit own message within CHAT_GENERAL_EDIT_WINDOW_SECONDS',
    description: 'Emits chat.general.mensaje-editado.',
  })
  @ApiOkResponse({ type: GeneralChatMessageEnvelopeDto })
  async edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: EditGeneralChatMessageDto,
  ) {
    return {
      message: await this.chatGeneralService.edit(user, messageId, dto),
    };
  }

  @Delete('messages/:messageId')
  @SkipThrottle({ default: true, auth: true, reports: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete own message (ADMINISTRADOR: any). Idempotent.',
    description: 'Emits chat.general.mensaje-eliminado.',
  })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<void> {
    await this.chatGeneralService.remove(user, messageId);
  }

  @Put('messages/:messageId/reaction')
  @ApiOperation({
    summary: 'Set my reaction (replaces the previous one)',
    description: 'Emits chat.general.reacciones-actualizadas.',
  })
  @ApiOkResponse({ type: GeneralChatMessageEnvelopeDto })
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: SetGeneralChatReactionDto,
  ) {
    return {
      message: await this.chatGeneralService.setReaction(
        user,
        messageId,
        dto.emoji,
      ),
    };
  }

  @Delete('messages/:messageId/reaction')
  @ApiOperation({ summary: 'Remove my reaction' })
  @ApiOkResponse({ type: GeneralChatMessageEnvelopeDto })
  async unreact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return {
      message: await this.chatGeneralService.clearReaction(user, messageId),
    };
  }

  @Get('updates')
  @ApiOperation({
    summary: 'Change feed for reconnects (creates, edits, deletes, reactions)',
  })
  @ApiOkResponse({ type: GeneralChatUpdatesResponseDto })
  updates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListGeneralChatUpdatesQueryDto,
  ) {
    return this.chatGeneralService.listUpdates(user, query);
  }

  @Put('read')
  @ApiOperation({
    summary: 'Advance my read pointer (monotonic)',
    description: 'Emits chat.general.lectura when it moves forward.',
  })
  @ApiOkResponse({ type: MarkGeneralChatReadResponseDto })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkGeneralChatReadDto,
  ) {
    return this.chatGeneralService.markRead(user, dto.lastReadSeq);
  }

  @Get('state')
  @ApiOperation({
    summary: 'Bootstrap: unread count, read pointers, limits, reactions',
  })
  state(@CurrentUser() user: AuthenticatedUser) {
    return this.chatGeneralService.getState(user);
  }
}
