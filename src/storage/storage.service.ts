import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import type { EnvConfig } from '../config/env.schema';

export interface StorageServicePort {
  uploadObject(
    bucket: string,
    key: string,
    buffer: Buffer,
    mime: string,
  ): Promise<void>;
  createSignedUrl(
    bucket: string,
    key: string,
    ttlSeconds: number,
  ): Promise<string>;
  removeObject(bucket: string, key: string): Promise<void>;
}

@Injectable()
export class StorageService implements StorageServicePort {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: ReturnType<typeof createClient>;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    const key = this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async uploadObject(
    bucket: string,
    key: string,
    buffer: Buffer,
    mime: string,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(key, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (error) {
      this.logger.error(`uploadObject failed: ${error.message}`);
      throw new InternalServerErrorException('Storage upload failed');
    }
  }

  async createSignedUrl(
    bucket: string,
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(key, ttlSeconds);

    if (error || !data?.signedUrl) {
      this.logger.error(
        `createSignedUrl failed: ${error?.message ?? 'no url'}`,
      );
      throw new InternalServerErrorException('Signed URL creation failed');
    }

    return data.signedUrl;
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([key]);

    if (error) {
      this.logger.error(`removeObject failed: ${error.message}`);
      throw new InternalServerErrorException('Storage remove failed');
    }
  }
}
