import {
  PrismaClient,
  ProjectStatus,
  RoleName,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
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
    fullName: 'Investigador A',
    password: 'ResearchPass1!',
    role: RoleName.INVESTIGADOR,
  },
  {
    email: 'researcher-b@quantia.local',
    fullName: 'Investigador B',
    password: 'ResearchPass1!',
    role: RoleName.INVESTIGADOR,
  },
] as const;

async function main(): Promise<void> {
  const seededUsers: Record<string, { id: string }> = {};

  for (const entry of users) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: entry.role },
    });
    const passwordHash = await argon2.hash(entry.password);
    const user = await prisma.user.upsert({
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
    seededUsers[entry.email] = user;
    console.log(`Seeded ${entry.email} (${entry.role})`);
  }

  const admin = seededUsers['admin@quantia.local'];
  const coord = seededUsers['coord@quantia.local'];
  const researcherA = seededUsers['researcher@quantia.local'];
  const researcherB = seededUsers['researcher-b@quantia.local'];

  await prisma.progress.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();

  const projectA = await prisma.project.create({
    data: {
      title: 'Proyecto Alpha — Formulación IA',
      description: 'Proyecto demo A para pertenencia cruzada.',
      objectives: 'Validar scoping de investigador A.',
      status: ProjectStatus.ACTIVE,
      coordinatorId: coord.id,
      createdById: admin.id,
      members: {
        create: [{ userId: researcherA.id }],
      },
      tasks: {
        create: [
          {
            title: 'Revisión de literatura',
            description: 'Tarea asignada al investigador A',
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.HIGH,
            assigneeId: researcherA.id,
          },
          {
            title: 'Definir métricas',
            status: TaskStatus.TODO,
            priority: TaskPriority.MEDIUM,
          },
        ],
      },
    },
    include: { tasks: true },
  });

  const projectB = await prisma.project.create({
    data: {
      title: 'Proyecto Beta — Sensores IoT',
      description:
        'Proyecto demo B visible solo para investigador B / coord / admin.',
      objectives: 'Validar aislamiento BOLA.',
      status: ProjectStatus.FORMULATION,
      coordinatorId: coord.id,
      createdById: coord.id,
      members: {
        create: [{ userId: researcherB.id }],
      },
      tasks: {
        create: [
          {
            title: 'Montaje de prototipo',
            status: TaskStatus.TODO,
            priority: TaskPriority.HIGH,
            assigneeId: researcherB.id,
          },
        ],
      },
    },
    include: { tasks: true },
  });

  await prisma.progress.create({
    data: {
      projectId: projectA.id,
      taskId: projectA.tasks[0]?.id,
      authorId: researcherA.id,
      title: 'Avance semanal Alpha',
      description: 'Se completó el 40% de la revisión bibliográfica.',
      evidenceLinks: ['https://example.com/evidence/alpha-1'],
      recordedAt: new Date(),
    },
  });

  await prisma.progress.create({
    data: {
      projectId: projectB.id,
      taskId: projectB.tasks[0]?.id,
      authorId: researcherB.id,
      title: 'Kickoff Beta',
      description: 'Arranque del prototipo IoT.',
      evidenceLinks: [],
      recordedAt: new Date(),
    },
  });

  console.log(`Seeded projects: ${projectA.title}, ${projectB.title}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
