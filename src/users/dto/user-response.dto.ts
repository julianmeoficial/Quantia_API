import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@quantia/contracts';

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

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
