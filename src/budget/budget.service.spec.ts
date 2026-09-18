import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BudgetExecutionKind } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { RoleName } from '@quantia/contracts';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter.service';
import { BudgetRepository } from './budget.repository';
import { BudgetService } from './budget.service';

describe('BudgetService', () => {
  let service: BudgetService;
  let repository: jest.Mocked<BudgetRepository>;
  let access: jest.Mocked<ProjectAccessService>;
  let realtime: jest.Mocked<
    Pick<RealtimeEmitter, 'emitPresupuestoEjecucionBaja'>
  >;

  const coord: AuthenticatedUser = {
    id: 'coord-id',
    email: 'coord@test.com',
    roles: [RoleName.COORDINADOR],
  };

  const budgetBase = {
    id: 'budget-1',
    projectId: 'proj-1',
    totalAmount: new Prisma.Decimal('1000.00'),
    currency: 'COP',
    alertThresholdPercent: 80,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [],
    executions: [],
  };

  beforeEach(() => {
    repository = {
      findByProjectId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      createExecution: jest.fn(),
      listExecutions: jest.fn(),
    } as unknown as jest.Mocked<BudgetRepository>;

    access = {
      assertCanAccessProject: jest.fn().mockResolvedValue({
        id: 'proj-1',
        coordinatorId: 'coord-id',
      }),
      assertCanManageProject: jest.fn().mockResolvedValue({
        id: 'proj-1',
        coordinatorId: 'coord-id',
      }),
    } as unknown as jest.Mocked<ProjectAccessService>;

    realtime = {
      emitPresupuestoEjecucionBaja: jest.fn().mockResolvedValue(undefined),
    };

    service = new BudgetService(
      repository,
      access,
      realtime as unknown as RealtimeEmitter,
    );
  });

  it('creates budget after manage check', async () => {
    repository.findByProjectId.mockResolvedValue(null);
    repository.create.mockResolvedValue({ ...budgetBase });

    const result = await service.createBudget(coord, 'proj-1', {
      totalAmount: '1000.00',
      currency: 'COP',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock
    expect(access.assertCanManageProject).toHaveBeenCalledWith(coord, 'proj-1');
    expect(result.totalAmount).toBe('1000.00');
    expect(result.executedPercent).toBe(0);
  });

  it('rejects get when no budget', async () => {
    repository.findByProjectId.mockResolvedValue(null);
    await expect(service.getBudget(coord, 'proj-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates execution and emits low-execution alert', async () => {
    repository.findByProjectId.mockResolvedValue({ ...budgetBase });
    repository.createExecution.mockResolvedValue({
      id: 'exec-1',
      budgetId: 'budget-1',
      itemId: null,
      kind: BudgetExecutionKind.PAYMENT,
      amount: new Prisma.Decimal('100.00'),
      occurredAt: new Date('2026-02-01T00:00:00.000Z'),
      registeredById: 'coord-id',
      note: null,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    repository.findById.mockResolvedValue({
      ...budgetBase,
      executions: [
        {
          id: 'exec-1',
          budgetId: 'budget-1',
          itemId: null,
          kind: BudgetExecutionKind.PAYMENT,
          amount: new Prisma.Decimal('100.00'),
          occurredAt: new Date('2026-02-01T00:00:00.000Z'),
          registeredById: 'coord-id',
          note: null,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ],
    });

    await service.createExecution(coord, 'proj-1', {
      kind: BudgetExecutionKind.PAYMENT,
      amount: '100.00',
    });

    expect(realtime.emitPresupuestoEjecucionBaja).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        budgetId: 'budget-1',
        executedPercent: 10,
        thresholdPercent: 80,
      }),
      'coord-id',
    );
  });

  it('does not emit when execution meets threshold', async () => {
    repository.findByProjectId.mockResolvedValue({ ...budgetBase });
    repository.createExecution.mockResolvedValue({
      id: 'exec-2',
      budgetId: 'budget-1',
      itemId: null,
      kind: BudgetExecutionKind.PAYMENT,
      amount: new Prisma.Decimal('900.00'),
      occurredAt: new Date(),
      registeredById: 'coord-id',
      note: null,
      createdAt: new Date(),
    });
    repository.findById.mockResolvedValue({
      ...budgetBase,
      executions: [
        {
          id: 'exec-2',
          budgetId: 'budget-1',
          itemId: null,
          kind: BudgetExecutionKind.PAYMENT,
          amount: new Prisma.Decimal('900.00'),
          occurredAt: new Date(),
          registeredById: 'coord-id',
          note: null,
          createdAt: new Date(),
        },
      ],
    });

    await service.createExecution(coord, 'proj-1', {
      kind: BudgetExecutionKind.PAYMENT,
      amount: '900.00',
    });

    expect(realtime.emitPresupuestoEjecucionBaja).not.toHaveBeenCalled();
  });

  it('forbids manage when access denies', async () => {
    access.assertCanManageProject.mockRejectedValue(
      new ForbiddenException('Only admin or project coordinator can manage'),
    );

    await expect(
      service.createBudget(coord, 'proj-1', { totalAmount: '1.00' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
