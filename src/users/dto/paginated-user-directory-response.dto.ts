import { ApiProperty } from '@nestjs/swagger';
import type { PaginatedUserDirectoryResponse } from '@quantia/contracts';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { UserDirectoryEntryDto } from './user-directory-entry.dto';

export class PaginatedUserDirectoryResponseDto implements PaginatedUserDirectoryResponse {
  @ApiProperty({ type: [UserDirectoryEntryDto] })
  data!: UserDirectoryEntryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
