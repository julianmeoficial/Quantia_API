import { PrismaClient, RoleName } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const users = [
  {
    email: 'admin@quantia.local',
    fullName: 'Admin Local',
    password: 'AdminPass1!',
    role: RoleName.ADMINISTRADOR,
  },
  {
    email: 'coord@quantia.local',
    fullName: 'Coordinador Local',
    password: 'CoordPass1!',
    role: RoleName.COORDINADOR,
  },
  {
    email: 'researcher@quantia.local',
    fullName: 'Investigador Local',
    password: 'ResearchPass1!',
    role: RoleName.INVESTIGADOR,
  },
] as const;

async function main(): Promise<void> {
  for (const entry of users) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: entry.role },
    });
    const passwordHash = await argon2.hash(entry.password);
    await prisma.user.upsert({
      where: { email: entry.email },
      update: {
        fullName: entry.fullName,
        passwordHash,
        isActive: true,
        userRoles: {
          deleteMany: {},
          create: [{ roleId: role.id }],
        },
      },
      create: {
        email: entry.email,
        fullName: entry.fullName,
        passwordHash,
        userRoles: {
          create: [{ roleId: role.id }],
        },
      },
    });
    console.log(`Seeded ${entry.email} (${entry.role})`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
