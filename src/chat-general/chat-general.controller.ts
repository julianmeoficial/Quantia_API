import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ChatGeneralService } from './chat-general.service';
import {
  CreateGeneralChatMessageDto,
  ListGeneralChatMessagesQueryDto,
} from './dto/chat-general.dto';

@ApiTags('chat-general')
@ApiBearerAuth()
@Controller({ path: 'chat/general', version: '1' })
export class ChatGeneralController {
  constructor(private readonly chatGeneralService: ChatGeneralService) {}

  @Post('messages')
  /** Skip default/auth/reports so only the named `chat-general` throttler applies. */
  @SkipThrottle({ default: true, auth: true, reports: true })
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
  list(@Query() query: ListGeneralChatMessagesQueryDto) {
    return this.chatGeneralService.listHistory(query);
  }
}
