import { ApiProperty } from '@nestjs/swagger';
import type { UserDirectoryEntry } from '@quantia/contracts';

export class UserDirectoryEntryDto implements UserDirectoryEntry {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;
}
