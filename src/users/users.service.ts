import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { SyncEntityType } from '@prisma/client';
import { hashPassword } from '../auth/password.util';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import { NotionSyncEnqueueService } from '../notion/notion-sync-enqueue.service';
import { UserDirectoryEntryDto } from './dto/user-directory-entry.dto';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserWithRoles, UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly notionSync: NotionSyncEnqueueService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      isActive: dto.isActive ?? true,
      roles: dto.roles,
    });
    await this.notionSync.enqueueDbToNotion(SyncEntityType.USER, user.id);
    return this.toResponse(user);
  }

  async findAll(
    page: number,
    pageSize: number,
  ): Promise<{
    data: UserResponseDto[];
    meta: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { total, users } = await this.usersRepository.findMany(
      page,
      pageSize,
    );
    return {
      data: users.map((user) => this.toResponse(user)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 0,
      },
    };
  }

  async searchDirectory(
    query: UserDirectoryQueryDto,
  ): Promise<PaginatedResult<UserDirectoryEntryDto>> {
    const { total, users } = await this.usersRepository.searchDirectory(
      query.q,
      query.page,
      query.pageSize,
    );
    return buildPaginatedResult(
      users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      })),
      query.page,
      query.pageSize,
      total,
    );
  }

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toResponse(user);
  }

  async findEntityByEmail(email: string): Promise<UserWithRoles | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findEntityById(id: string): Promise<UserWithRoles | null> {
    return this.usersRepository.findById(id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email.toLowerCase() !== existing.email) {
      const conflict = await this.usersRepository.findByEmail(dto.email);
      if (conflict) {
        throw new ConflictException('Email already registered');
      }
    }

    const passwordHash = dto.password
      ? await hashPassword(dto.password)
      : undefined;

    const user = await this.usersRepository.update(id, {
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      isActive: dto.isActive,
      roles: dto.roles,
    });
    await this.notionSync.enqueueDbToNotion(SyncEntityType.USER, user.id);
    return this.toResponse(user);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    await this.usersRepository.delete(id);
  }

  toResponse(user: UserWithRoles): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roles: user.userRoles.map((ur): RoleName => ur.role.name),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
