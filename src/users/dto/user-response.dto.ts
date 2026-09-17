import { RoleName } from '@quantia/contracts';

export class UserResponseDto {
  id!: string;
  email!: string;
  fullName!: string;
  isActive!: boolean;
  roles!: RoleName[];
  createdAt!: string;
  updatedAt!: string;
}
