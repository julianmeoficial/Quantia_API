import { ApiProperty } from '@nestjs/swagger';
import { AvatarKey, RoleName } from '@quantia/contracts';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ enum: RoleName, isArray: true })
  roles!: RoleName[];

  @ApiProperty({
    enum: AvatarKey,
    nullable: true,
    description: 'One of the 5 predefined avatars; null until chosen.',
  })
  avatar!: AvatarKey | null;

  @ApiProperty({
    description:
      'True while no avatar is chosen. Chat endpoints/socket answer AVATAR_REQUIRED until then.',
  })
  avatarRequired!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
