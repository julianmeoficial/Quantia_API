import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';
import type { EnvConfig } from '../config/env.schema';

type NotionPage = Awaited<ReturnType<Client['pages']['retrieve']>>;

@Injectable()
export class NotionClient {
  private readonly logger = new Logger(NotionClient.name);
  private readonly client: Client;
  private readonly maxAttempts: number;
  private readonly minIntervalMs: number;
  private nextSlotAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    const token = this.config.get('NOTION_TOKEN', { infer: true });
    const version = this.config.get('NOTION_VERSION', { infer: true });
    const rps = this.config.get('NOTION_RATE_LIMIT_RPS', { infer: true });
    this.maxAttempts = this.config.get('NOTION_SYNC_MAX_ATTEMPTS', {
      infer: true,
    });
    this.minIntervalMs = Math.ceil(1000 / rps);
    this.client = new Client({
      auth: token,
      notionVersion: version,
    });
  }

  async queryDataSource(
    dataSourceId: string,
    body: Record<string, unknown> = {},
  ): Promise<{ results: NotionPage[]; next_cursor: string | null }> {
    return this.throttled(async () => {
      const response = await this.client.request<{
        results: NotionPage[];
        next_cursor: string | null;
      }>({
        path: `data_sources/${dataSourceId}/query`,
        method: 'post',
        body,
      });
      return response;
    });
  }

  async getPage(pageId: string): Promise<NotionPage> {
    return this.throttled(() =>
      this.client.pages.retrieve({ page_id: pageId }),
    );
  }

  async createPage(params: {
    parentDatabaseId: string;
    properties: Record<string, unknown>;
  }): Promise<NotionPage> {
    return this.throttled(() =>
      this.client.pages.create({
        parent: { database_id: params.parentDatabaseId },
        properties: params.properties as never,
      }),
    );
  }

  async updatePage(
    pageId: string,
    properties: Record<string, unknown>,
  ): Promise<NotionPage> {
    return this.throttled(() =>
      this.client.pages.update({
        page_id: pageId,
        properties: properties as never,
      }),
    );
  }

  async usersMe(): Promise<unknown> {
    return this.throttled(() => this.client.users.me({}));
  }

  private async throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextSlotAt - now);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.nextSlotAt = Date.now() + this.minIntervalMs;
      return this.withRetry(fn);
    });

    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const status =
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof error.status === 'number'
            ? (error as { status: number }).status
            : undefined;
        if (status !== 429 || attempt >= this.maxAttempts) {
          throw error;
        }
        const backoffMs = Math.min(30_000, 250 * 2 ** (attempt - 1));
        this.logger.warn(
          `Notion 429; retry ${attempt}/${this.maxAttempts} in ${backoffMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw lastError;
  }
}
