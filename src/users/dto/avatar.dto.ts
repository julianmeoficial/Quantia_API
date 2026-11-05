import { ApiProperty } from '@nestjs/swagger';
import { AVATAR_CATALOG, AvatarKey } from '@quantia/contracts';
import { IsEnum } from 'class-validator';

export class UpdateMyAvatarDto {
  @ApiProperty({ enum: AvatarKey, example: AvatarKey.AVATAR_01 })
  @IsEnum(AvatarKey)
  avatar!: AvatarKey;
}

export class AvatarOptionDto {
  @ApiProperty({ enum: AvatarKey })
  key!: AvatarKey;

  @ApiProperty({ example: AVATAR_CATALOG[0].label })
  label!: string;

  @ApiProperty({ example: AVATAR_CATALOG[0].color })
  color!: string;
}

export class AvatarCatalogResponseDto {
  @ApiProperty({ type: [AvatarOptionDto] })
  items!: AvatarOptionDto[];
}
