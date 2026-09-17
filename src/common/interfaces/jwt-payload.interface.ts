import { RoleName } from '@quantia/contracts';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: RoleName[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: RoleName[];
}
