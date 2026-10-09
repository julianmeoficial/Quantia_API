import { ApiProperty } from '@nestjs/swagger';
import type { PaginationMeta } from '@quantia/contracts';

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 0 })
  totalPages!: number;
}
