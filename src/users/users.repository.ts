import { Injectable } from '@nestjs/common';
import { RoleName as ContractRoleName } from '@quantia/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const userWithRoles = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    userRoles: {
      include: { role: true },
    },
  },
});

export type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: userWithRoles.include,
    });
  }

  findById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithRoles.include,
    });
  }

  async findMany(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: userWithRoles.include,
      }),
    ]);
    return { total, users };
  }

  async create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    isActive: boolean;
    roles: ContractRoleName[];
  }): Promise<UserWithRoles> {
    const roles = await this.prisma.role.findMany({
      where: { name: { in: data.roles } },
    });

    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        isActive: data.isActive,
        userRoles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
      include: userWithRoles.include,
    });
  }

  async update(
    id: string,
    data: {
      email?: string;
      passwordHash?: string;
      fullName?: string;
      isActive?: boolean;
      roles?: ContractRoleName[];
    },
  ): Promise<UserWithRoles> {
    return this.prisma.$transaction(async (tx) => {
      if (data.roles) {
        const roles = await tx.role.findMany({
          where: { name: { in: data.roles } },
        });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: id, roleId: role.id })),
        });
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(data.email !== undefined
            ? { email: data.email.toLowerCase() }
            : {}),
          ...(data.passwordHash !== undefined
            ? { passwordHash: data.passwordHash }
            : {}),
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
        include: userWithRoles.include,
      });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }
}
