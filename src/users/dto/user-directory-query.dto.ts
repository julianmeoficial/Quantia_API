import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  USER_DIRECTORY_PAGE_SIZE_MAX,
  USER_DIRECTORY_QUERY_MAX_LENGTH,
  USER_DIRECTORY_QUERY_MIN_LENGTH,
  type UserDirectoryQuery,
} from '@quantia/contracts';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UserDirectoryQueryDto implements UserDirectoryQuery {
  @ApiProperty({
    description: 'Case-insensitive match on full name or e-mail',
    minLength: USER_DIRECTORY_QUERY_MIN_LENGTH,
    maxLength: USER_DIRECTORY_QUERY_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(USER_DIRECTORY_QUERY_MIN_LENGTH)
  @MaxLength(USER_DIRECTORY_QUERY_MAX_LENGTH)
  q!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: USER_DIRECTORY_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USER_DIRECTORY_PAGE_SIZE_MAX)
  pageSize: number = 20;
}
