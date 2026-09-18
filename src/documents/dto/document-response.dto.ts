import {
  DocumentStatus,
  type DocumentDownloadResponse,
  type DocumentResponse,
} from '@quantia/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListDocumentsQueryDto extends PaginationQueryDto {}

export class DocumentResponseDto implements DocumentResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  uploadedById!: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ enum: DocumentStatus })
  status!: DocumentStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class DocumentDownloadResponseDto implements DocumentDownloadResponse {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty()
  expiresInSeconds!: number;
}
