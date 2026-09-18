import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BudgetExecution, type BudgetItem } from '@prisma/client';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter.service';
import {
  type BudgetWithRelations,
  BudgetRepository,
} from './budget.repository';
import {
  BudgetExecutionResponseDto,
  BudgetResponseDto,
} from './dto/budget-response.dto';
import {
  CreateBudgetDto,
  CreateBudgetExecutionDto,
  ListBudgetExecutionsQueryDto,
  UpdateBudgetDto,
} from './dto/budget.dto';

@Injectable()
export class BudgetService {
  constructor(
    private readonly budgetRepository: BudgetRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async getBudget(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<BudgetResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const budget = await this.budgetRepository.findByProjectId(projectId);
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }
    return this.toBudgetResponse(budget);
  }

  async createBudget(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateBudgetDto,
  ): Promise<BudgetResponseDto> {
    await this.projectAccess.assertCanManageProject(user, projectId);

    const existing = await this.budgetRepository.findByProjectId(projectId);
    if (existing) {
      throw new ConflictException('Budget already exists for this project');
    }

    const budget = await this.budgetRepository.create({
      projectId,
      totalAmount: new Prisma.Decimal(dto.totalAmount),
      currency: dto.currency ?? 'COP',
      alertThresholdPercent: dto.alertThresholdPercent ?? 80,
      items: dto.items?.map((item) => ({
        category: item.category,
        plannedAmount: new Prisma.Decimal(item.plannedAmount),
        notes: item.notes,
      })),
    });

    return this.toBudgetResponse(budget);
  }

  async updateBudget(
    user: AuthenticatedUser,
    projectId: string,
    dto: UpdateBudgetDto,
  ): Promise<BudgetResponseDto> {
    await this.projectAccess.assertCanManageProject(user, projectId);
    const existing = await this.budgetRepository.findByProjectId(projectId);
    if (!existing) {
      throw new NotFoundException('Budget not found');
    }

    const budget = await this.budgetRepository.update(existing.id, {
      totalAmount:
        dto.totalAmount !== undefined
          ? new Prisma.Decimal(dto.totalAmount)
          : undefined,
      currency: dto.currency,
      alertThresholdPercent: dto.alertThresholdPercent,
      replaceItems: dto.items?.map((item) => ({
        category: item.category,
        plannedAmount: new Prisma.Decimal(item.plannedAmount),
        notes: item.notes,
      })),
    });

    return this.toBudgetResponse(budget);
  }

  async createExecution(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateBudgetExecutionDto,
  ): Promise<BudgetExecutionResponseDto> {
    const project = await this.projectAccess.assertCanManageProject(
      user,
      projectId,
    );
    const budget = await this.budgetRepository.findByProjectId(projectId);
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    if (dto.itemId) {
      const item = budget.items.find((i) => i.id === dto.itemId);
      if (!item) {
        throw new NotFoundException('Budget item not found');
      }
    }

    const execution = await this.budgetRepository.createExecution({
      budgetId: budget.id,
      itemId: dto.itemId,
      kind: dto.kind,
      amount: new Prisma.Decimal(dto.amount),
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      registeredById: user.id,
      note: dto.note,
    });

    const refreshed = await this.budgetRepository.findById(budget.id);
    if (refreshed) {
      const { executedPercent } = this.computeExecution(refreshed);
      if (executedPercent < refreshed.alertThresholdPercent) {
        await this.realtime.emitPresupuestoEjecucionBaja(
          {
            projectId,
            budgetId: refreshed.id,
            executedPercent,
            thresholdPercent: refreshed.alertThresholdPercent,
            updatedAt: new Date().toISOString(),
          },
          project.coordinatorId,
        );
      }
    }

    return this.toExecutionResponse(execution);
  }

  async listExecutions(
    user: AuthenticatedUser,
    projectId: string,
    query: ListBudgetExecutionsQueryDto,
  ): Promise<PaginatedResult<BudgetExecutionResponseDto>> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const budget = await this.budgetRepository.findByProjectId(projectId);
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { total, executions } = await this.budgetRepository.listExecutions(
      budget.id,
      page,
      pageSize,
    );

    return buildPaginatedResult(
      executions.map((e) => this.toExecutionResponse(e)),
      page,
      pageSize,
      total,
    );
  }

  toBudgetResponse(budget: BudgetWithRelations): BudgetResponseDto {
    const { executedAmount, executedPercent } = this.computeExecution(budget);
    return {
      id: budget.id,
      projectId: budget.projectId,
      totalAmount: this.decimalToString(budget.totalAmount),
      currency: budget.currency,
      alertThresholdPercent: budget.alertThresholdPercent,
      executedAmount: this.decimalToString(executedAmount),
      executedPercent,
      items: budget.items.map((item) => this.toItemResponse(item)),
      createdAt: budget.createdAt.toISOString(),
      updatedAt: budget.updatedAt.toISOString(),
    };
  }

  toExecutionResponse(execution: BudgetExecution): BudgetExecutionResponseDto {
    return {
      id: execution.id,
      itemId: execution.itemId,
      kind: execution.kind,
      amount: this.decimalToString(execution.amount),
      occurredAt: execution.occurredAt.toISOString(),
      registeredById: execution.registeredById,
      note: execution.note,
      createdAt: execution.createdAt.toISOString(),
    };
  }

  private toItemResponse(item: BudgetItem) {
    return {
      id: item.id,
      category: item.category,
      plannedAmount: this.decimalToString(item.plannedAmount),
      notes: item.notes,
    };
  }

  private computeExecution(budget: BudgetWithRelations): {
    executedAmount: Prisma.Decimal;
    executedPercent: number;
  } {
    const executedAmount = budget.executions.reduce(
      (sum, exec) => sum.add(exec.amount),
      new Prisma.Decimal(0),
    );
    const total = new Prisma.Decimal(budget.totalAmount);
    const executedPercent = total.isZero()
      ? 0
      : executedAmount.div(total).mul(100).toDecimalPlaces(2).toNumber();
    return { executedAmount, executedPercent };
  }

  private decimalToString(value: Prisma.Decimal): string {
    return value.toFixed(2);
  }
}
