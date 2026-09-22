import {
  AuditResult,
  BudgetExecutionKind,
  DocumentStatus,
  PrismaClient,
  ProjectStatus,
  ReportKind,
  ReportStatus,
  RoleName,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

// Seed uses argon2id explicitly (same baseline as API password.util).
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

const prisma = new PrismaClient();

const DOCUMENTS_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS ?? 'quantia-documents';
const REPORTS_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET_REPORTS ?? 'quantia-reports';

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
    const passwordHash = await argon2.hash(entry.password, ARGON2_OPTS);
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

  // Child tables first (F5 + domain) so re-seed is idempotent.
  await prisma.$executeRawUnsafe(
    `SELECT set_config('app.audit_mutable', '1', false)`,
  );
  await prisma.auditLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.document.deleteMany();
  await prisma.budgetExecution.deleteMany();
  await prisma.budgetItem.deleteMany();
  await prisma.budget.deleteMany();
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

  const budgetA = await prisma.budget.create({
    data: {
      projectId: projectA.id,
      totalAmount: 50_000_000,
      currency: 'COP',
      alertThresholdPercent: 80,
      items: {
        create: [
          {
            category: 'Personal',
            plannedAmount: 30_000_000,
            notes: 'Honorarios investigadores',
          },
          {
            category: 'Equipos',
            plannedAmount: 20_000_000,
            notes: 'Hardware / licencias',
          },
        ],
      },
    },
    include: { items: true },
  });

  await prisma.budgetExecution.create({
    data: {
      budgetId: budgetA.id,
      itemId: budgetA.items[0]?.id,
      kind: BudgetExecutionKind.PAYMENT,
      amount: 5_000_000,
      occurredAt: new Date(),
      registeredById: coord.id,
      note: 'Anticipo personal — seed F7',
    },
  });

  await prisma.budget.create({
    data: {
      projectId: projectB.id,
      totalAmount: 12_000_000,
      currency: 'COP',
      alertThresholdPercent: 70,
      items: {
        create: [
          {
            category: 'Materiales',
            plannedAmount: 12_000_000,
          },
        ],
      },
    },
  });

  await prisma.document.create({
    data: {
      projectId: projectA.id,
      uploadedById: researcherA.id,
      storageBucket: DOCUMENTS_BUCKET,
      storageKey: `seed/${projectA.id}/protocolo-alpha.pdf`,
      originalName: 'protocolo-alpha.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12_345,
      status: DocumentStatus.UPLOADED,
    },
  });

  await prisma.report.create({
    data: {
      projectId: projectA.id,
      requestedById: coord.id,
      kind: ReportKind.BUDGET_PDF,
      status: ReportStatus.QUEUED,
      storageBucket: REPORTS_BUCKET,
      storageKey: null,
      jobId: 'seed-report-placeholder',
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: 'seed.f7',
        resource: 'project',
        resourceId: projectA.id,
        result: AuditResult.SUCCESS,
        ip: '127.0.0.1',
        userAgent: 'prisma-seed',
        metadata: { phase: 'F7', note: 'handoff seed' },
      },
      {
        actorId: coord.id,
        action: 'budget.execution.create',
        resource: 'budget',
        resourceId: budgetA.id,
        result: AuditResult.SUCCESS,
        ip: '127.0.0.1',
        userAgent: 'prisma-seed',
        metadata: { amount: 5_000_000 },
      },
    ],
  });

  console.log(`Seeded projects: ${projectA.title}, ${projectB.title}`);
  console.log(
    'Seeded F5: budgets, executions, document metadata stub, report row, audit_logs',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
