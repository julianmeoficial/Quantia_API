import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import { UsersRepository, UserWithRoles } from './users.repository';
import { UsersService } from './users.service';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('UsersService', () => {
  const repository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as unknown as UsersRepository;

  const service = new UsersService(repository);

  const sampleUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@quantia.test',
    passwordHash: 'hashed-password',
    fullName: 'Admin User',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    userRoles: [
      {
        userId: '11111111-1111-1111-1111-111111111111',
        roleId: '33333333-3333-3333-3333-333333333333',
        role: {
          id: '33333333-3333-3333-3333-333333333333',
          name: 'ADMINISTRADOR',
          createdAt: new Date(),
        },
      },
    ],
  } as unknown as UserWithRoles;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a user and never returns passwordHash', async () => {
    (repository.findByEmail as jest.Mock).mockResolvedValue(null);
    (repository.create as jest.Mock).mockResolvedValue(sampleUser);

    const result = await service.create({
      email: 'admin@quantia.test',
      password: 'password123',
      fullName: 'Admin User',
      roles: [RoleName.ADMINISTRADOR],
    });

    expect(argon2.hash).toHaveBeenCalledWith('password123');
    expect(result).toEqual({
      id: sampleUser.id,
      email: sampleUser.email,
      fullName: sampleUser.fullName,
      isActive: true,
      roles: [RoleName.ADMINISTRADOR],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email on create', async () => {
    (repository.findByEmail as jest.Mock).mockResolvedValue(sampleUser);
    await expect(
      service.create({
        email: 'admin@quantia.test',
        password: 'password123',
        fullName: 'Admin User',
        roles: [RoleName.ADMINISTRADOR],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound when updating missing user', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      service.update('11111111-1111-1111-1111-111111111111', {
        fullName: 'Nope',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
