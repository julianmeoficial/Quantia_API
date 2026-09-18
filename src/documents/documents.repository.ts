import { Injectable } from '@nestjs/common';
import { DocumentStatus, type Document, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    projectId: string;
    uploadedById: string;
    storageBucket: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status?: DocumentStatus;
  }): Promise<Document> {
    return this.prisma.document.create({
      data: {
        ...data,
        status: data.status ?? DocumentStatus.UPLOADED,
      },
    });
  }

  findById(id: string): Promise<Document | null> {
    return this.prisma.document.findUnique({ where: { id } });
  }

  async findMany(params: {
    where: Prisma.DocumentWhereInput;
    page: number;
    pageSize: number;
  }): Promise<{ total: number; documents: Document[] }> {
    const skip = (params.page - 1) * params.pageSize;
    const [total, documents] = await this.prisma.$transaction([
      this.prisma.document.count({ where: params.where }),
      this.prisma.document.findMany({
        where: params.where,
        skip,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { total, documents };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }
}
