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
import { AuditResult, SyncEntityType } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { Public } from '../common/decorators/public.decorator';
import type { EnvConfig } from '../config/env.schema';
import { NotionSyncEnqueueService } from './notion-sync-enqueue.service';
import { NotionWebhookReplayService } from './notion-webhook-replay.service';

@ApiTags('webhooks')
@Controller({ path: 'webhooks/notion', version: '1' })
export class NotionWebhookController {
  private readonly logger = new Logger(NotionWebhookController.name);

  constructor(
    private readonly enqueue: NotionSyncEnqueueService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly replay: NotionWebhookReplayService,
    private readonly audit: AuditService,
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
      // Handshake: return token in body for Notion UI; never log the value (T-08).
      this.logger.log('Notion webhook verification handshake received');
      return { verification_token: body.verification_token };
    }

    await this.assertSignature(signature, req.rawBody, body);
    // signature is defined after assertSignature
    const sig = signature as string;

    await this.assertTimestampInWindow(body);
    await this.assertNotReplay(sig);

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

  private async rejectWebhook(reason: string): Promise<never> {
    await this.audit.log({
      actorId: null,
      action: 'WEBHOOK_REJECTED',
      resource: 'webhook',
      result: AuditResult.DENIED,
      metadata: { reason },
    });
    throw new UnauthorizedException(reason);
  }

  private async assertSignature(
    signature: string | undefined,
    rawBody: Buffer | undefined,
    body: Record<string, unknown>,
  ): Promise<void> {
    const secret = this.config.get('NOTION_WEBHOOK_SECRET', { infer: true });
    if (!signature) {
      await this.rejectWebhook('Missing Notion signature');
    }
    const provided = signature as string;

    const payload = rawBody?.toString('utf8') ?? JSON.stringify(body);
    const expected = `sha256=${createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.rejectWebhook('Invalid Notion signature');
    }
  }

  private async assertTimestampInWindow(
    body: Record<string, unknown>,
  ): Promise<void> {
    const skew = this.config.get('NOTION_WEBHOOK_MAX_SKEW_SECONDS', {
      infer: true,
    });
    if (typeof body.timestamp !== 'string') {
      await this.rejectWebhook('Webhook timestamp missing or invalid');
    }
    const eventMs = Date.parse(body.timestamp as string);
    if (Number.isNaN(eventMs)) {
      await this.rejectWebhook('Webhook timestamp missing or invalid');
    }
    const deltaSec = Math.abs(Date.now() - eventMs) / 1000;
    if (deltaSec > skew) {
      await this.rejectWebhook('Webhook timestamp outside allowed window');
    }
  }

  private async assertNotReplay(signature: string): Promise<void> {
    const skew = this.config.get('NOTION_WEBHOOK_MAX_SKEW_SECONDS', {
      infer: true,
    });
    const claimed = await this.replay.claim(signature, skew);
    if (!claimed) {
      await this.rejectWebhook('Webhook replay rejected');
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
