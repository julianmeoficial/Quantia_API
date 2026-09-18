import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Public } from '../common/decorators/public.decorator';
import type { EnvConfig } from '../config/env.schema';
import { NotionSyncEnqueueService } from './notion-sync-enqueue.service';
import { SyncEntityType } from '@prisma/client';

@ApiTags('webhooks')
@Controller({ path: 'webhooks/notion', version: '1' })
export class NotionWebhookController {
  private readonly logger = new Logger(NotionWebhookController.name);

  constructor(
    private readonly enqueue: NotionSyncEnqueueService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Body() body: Record<string, unknown>,
    @Headers('x-notion-signature') signature: string | undefined,
    @Req() req: { rawBody?: Buffer },
  ): Promise<{ ok: true } | { verification_token: string }> {
    if (typeof body.verification_token === 'string') {
      // Temporary visibility for Notion subscription handshake (paste into Notion UI).
      this.logger.warn(
        `Notion webhook verification_token (paste in Notion UI): ${body.verification_token}`,
      );
      return { verification_token: body.verification_token };
    }

    this.assertSignature(signature, req.rawBody, body);

    const notionPageId = this.extractPageId(body);
    if (!notionPageId) {
      throw new BadRequestException('Webhook payload missing page id');
    }

    const lastEditedTime =
      typeof body.timestamp === 'string' ? body.timestamp : undefined;
    const entityType = this.guessEntityType(body);

    await this.enqueue.enqueueNotionToDb({
      notionPageId,
      lastEditedTime,
      entityType,
    });

    return { ok: true };
  }

  private assertSignature(
    signature: string | undefined,
    rawBody: Buffer | undefined,
    body: Record<string, unknown>,
  ): void {
    const secret = this.config.get('NOTION_WEBHOOK_SECRET', { infer: true });
    if (!signature) {
      throw new UnauthorizedException('Missing Notion signature');
    }

    const payload = rawBody?.toString('utf8') ?? JSON.stringify(body);
    const expected = `sha256=${createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid Notion signature');
    }
  }

  private extractPageId(body: Record<string, unknown>): string | null {
    const entity = body.entity;
    if (entity && typeof entity === 'object' && 'id' in entity) {
      const id = entity.id;
      if (typeof id === 'string') return id;
    }
    const data = body.data;
    if (data && typeof data === 'object' && 'id' in data) {
      const id = data.id;
      if (typeof id === 'string') return id;
    }
    if (typeof body.id === 'string') return body.id;
    return null;
  }

  private guessEntityType(
    body: Record<string, unknown>,
  ): SyncEntityType | undefined {
    const type =
      typeof body.type === 'string'
        ? body.type.toLowerCase()
        : typeof body.entity === 'object' &&
            body.entity &&
            'type' in body.entity &&
            typeof body.entity.type === 'string'
          ? String((body.entity as { type: string }).type).toLowerCase()
          : '';
    if (type.includes('user')) return SyncEntityType.USER;
    if (type.includes('task')) return SyncEntityType.TASK;
    if (type.includes('progress') || type.includes('avance')) {
      return SyncEntityType.PROGRESS;
    }
    if (type.includes('project') || type.includes('page')) {
      return SyncEntityType.PROJECT;
    }
    return undefined;
  }
}
