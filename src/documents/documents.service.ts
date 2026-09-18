import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus, type Document } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import type { EnvConfig } from '../config/env.schema';
import { MimeGuardService } from '../storage/mime-guard.service';
import { StorageService } from '../storage/storage.service';
import { DocumentsRepository } from './documents.repository';
import {
  DocumentDownloadResponseDto,
  DocumentResponseDto,
  ListDocumentsQueryDto,
} from './dto/document-response.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly storage: StorageService,
    private readonly mimeGuard: MimeGuardService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async upload(
    user: AuthenticatedUser,
    projectId: string,
    file: Express.Multer.File | undefined,
  ): Promise<DocumentResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const mimeType = this.mimeGuard.assertAllowed(
      file.buffer,
      file.mimetype || undefined,
    );
    const bucket = this.config.get('SUPABASE_STORAGE_BUCKET_DOCUMENTS', {
      infer: true,
    });
    const storageKey = `${projectId}/${randomUUID()}`;

    await this.storage.uploadObject(bucket, storageKey, file.buffer, mimeType);

    const document = await this.documentsRepository.create({
      projectId,
      uploadedById: user.id,
      storageBucket: bucket,
      storageKey,
      originalName: file.originalname || 'upload',
      mimeType,
      sizeBytes: file.buffer.length,
      status: DocumentStatus.UPLOADED,
    });

    return this.toResponse(document);
  }

  async list(
    user: AuthenticatedUser,
    projectId: string,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedResult<DocumentResponseDto>> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { total, documents } = await this.documentsRepository.findMany({
      where: { projectId },
      page,
      pageSize,
    });

    return buildPaginatedResult(
      documents.map((d) => this.toResponse(d)),
      page,
      pageSize,
      total,
    );
  }

  async getDownloadUrl(
    user: AuthenticatedUser,
    projectId: string,
    documentId: string,
  ): Promise<DocumentDownloadResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const document = await this.documentsRepository.findById(documentId);
    if (!document || document.projectId !== projectId) {
      throw new NotFoundException('Document not found');
    }

    const expiresInSeconds = this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS', {
      infer: true,
    });
    const url = await this.storage.createSignedUrl(
      document.storageBucket,
      document.storageKey,
      expiresInSeconds,
    );

    return {
      documentId: document.id,
      url,
      expiresInSeconds,
    };
  }

  async remove(
    user: AuthenticatedUser,
    projectId: string,
    documentId: string,
  ): Promise<void> {
    await this.projectAccess.assertCanManageProject(user, projectId);
    const document = await this.documentsRepository.findById(documentId);
    if (!document || document.projectId !== projectId) {
      throw new NotFoundException('Document not found');
    }

    await this.storage.removeObject(
      document.storageBucket,
      document.storageKey,
    );
    await this.documentsRepository.delete(documentId);
  }

  toResponse(document: Document): DocumentResponseDto {
    return {
      id: document.id,
      projectId: document.projectId,
      uploadedById: document.uploadedById,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      createdAt: document.createdAt.toISOString(),
    };
  }
}
