import { Injectable, NotFoundException } from '@nestjs/common';
import type { StorageServicePort } from './storage.service';

@Injectable()
export class InMemoryStorageService implements StorageServicePort {
  private readonly objects = new Map<
    string,
    { buffer: Buffer; mime: string }
  >();

  private objectKey(bucket: string, key: string): string {
    return `${bucket}::${key}`;
  }

  uploadObject(
    bucket: string,
    key: string,
    buffer: Buffer,
    mime: string,
  ): Promise<void> {
    this.objects.set(this.objectKey(bucket, key), {
      buffer: Buffer.from(buffer),
      mime,
    });
    return Promise.resolve();
  }

  createSignedUrl(
    bucket: string,
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    const entry = this.objects.get(this.objectKey(bucket, key));
    if (!entry) {
      return Promise.reject(
        new NotFoundException('Object not found in storage'),
      );
    }
    return Promise.resolve(
      `https://in-memory.local/${bucket}/${encodeURIComponent(key)}?ttl=${ttlSeconds}`,
    );
  }

  removeObject(bucket: string, key: string): Promise<void> {
    this.objects.delete(this.objectKey(bucket, key));
    return Promise.resolve();
  }

  clear(): void {
    this.objects.clear();
  }
}
