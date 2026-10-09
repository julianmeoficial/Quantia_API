import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import * as passwordUtil from '../auth/password.util';
import { UsersRepository, UserWithRoles } from './users.repository';
import { UsersService } from './users.service';

jest.mock('../auth/password.util', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('UsersService', () => {
  const searchDirectory = jest.fn();
  const updateUser = jest.fn();
  const deleteUser = jest.fn();
  const repository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    searchDirectory,
    create: jest.fn(),
    update: updateUser,
    delete: deleteUser,
  } as unknown as UsersRepository;

  const service = new UsersService(repository, {
    enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
  } as never);

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

  describe('searchDirectory', () => {
    it('returns only id, fullName and email with pagination meta', async () => {
      searchDirectory.mockResolvedValue({
        total: 21,
        users: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            fullName: 'Ana Pérez',
            email: 'ana@quantia.test',
          },
        ],
      });

      const result = await service.searchDirectory({
        q: 'ana',
        page: 2,
        pageSize: 20,
      });

      expect(searchDirectory).toHaveBeenCalledWith('ana', 2, 20);
      expect(result).toEqual({
        data: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            fullName: 'Ana Pérez',
            email: 'ana@quantia.test',
          },
        ],
        meta: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      });
      expect(Object.keys(result.data[0]).sort()).toEqual([
        'email',
        'fullName',
        'id',
      ]);
    });

    it('returns an empty page when nothing matches', async () => {
      searchDirectory.mockResolvedValue({
        total: 0,
        users: [],
      });

      const result = await service.searchDirectory({
        q: 'zz',
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
    });
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

    expect(passwordUtil.hashPassword).toHaveBeenCalledWith('password123');
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

  it('lists users with pagination meta and no password hashes', async () => {
    (repository.findMany as jest.Mock).mockResolvedValue({
      total: 41,
      users: [sampleUser],
    });

    const result = await service.findAll(3, 20);

    expect(result.meta).toEqual({
      page: 3,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('passwordHash');
  });

  it('finds a user by id', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(sampleUser);
    await expect(service.findById(sampleUser.id)).resolves.toMatchObject({
      id: sampleUser.id,
      roles: [RoleName.ADMINISTRADOR],
    });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a user, hashing a new password', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(sampleUser);
    updateUser.mockResolvedValue({
      ...sampleUser,
      fullName: 'Renamed',
    });

    const result = await service.update(sampleUser.id, {
      fullName: 'Renamed',
      password: 'new-password-123',
    });

    expect(passwordUtil.hashPassword).toHaveBeenCalledWith('new-password-123');
    expect(updateUser).toHaveBeenCalledWith(
      sampleUser.id,
      expect.objectContaining({
        fullName: 'Renamed',
        passwordHash: 'hashed-password',
      }),
    );
    expect(result.fullName).toBe('Renamed');
  });

  it('rejects an e-mail change that collides with another user', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(sampleUser);
    (repository.findByEmail as jest.Mock).mockResolvedValue({
      ...sampleUser,
      id: '99999999-9999-9999-9999-999999999999',
    });

    await expect(
      service.update(sampleUser.id, { email: 'other@quantia.test' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes an existing user', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(sampleUser);
    await service.remove(sampleUser.id);
    expect(deleteUser).toHaveBeenCalledWith(sampleUser.id);
  });

  it('throws NotFoundException when removing a missing user', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when updating missing user', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      service.update('missing', { fullName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
