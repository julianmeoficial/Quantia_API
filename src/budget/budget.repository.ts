import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Budget,
  type BudgetExecution,
  type BudgetItem,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type BudgetWithRelations = Budget & {
  items: BudgetItem[];
  executions: BudgetExecution[];
};

@Injectable()
export class BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProjectId(projectId: string): Promise<BudgetWithRelations | null> {
    return this.prisma.budget.findUnique({
      where: { projectId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        executions: { orderBy: { occurredAt: 'desc' } },
      },
    });
  }

  findById(id: string): Promise<BudgetWithRelations | null> {
    return this.prisma.budget.findUnique({
      where: { id },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        executions: { orderBy: { occurredAt: 'desc' } },
      },
    });
  }

  create(data: {
    projectId: string;
    totalAmount: Prisma.Decimal;
    currency: string;
    alertThresholdPercent: number;
    items?: Array<{
      category: string;
      plannedAmount: Prisma.Decimal;
      notes?: string;
    }>;
  }): Promise<BudgetWithRelations> {
    return this.prisma.budget.create({
      data: {
        projectId: data.projectId,
        totalAmount: data.totalAmount,
        currency: data.currency,
        alertThresholdPercent: data.alertThresholdPercent,
        items: data.items
          ? {
              create: data.items.map((item) => ({
                category: item.category,
                plannedAmount: item.plannedAmount,
                notes: item.notes,
              })),
            }
          : undefined,
      },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        executions: { orderBy: { occurredAt: 'desc' } },
      },
    });
  }

  async update(
    id: string,
    data: {
      totalAmount?: Prisma.Decimal;
      currency?: string;
      alertThresholdPercent?: number;
      replaceItems?: Array<{
        category: string;
        plannedAmount: Prisma.Decimal;
        notes?: string;
      }>;
    },
  ): Promise<BudgetWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      if (data.replaceItems) {
        await tx.budgetItem.deleteMany({ where: { budgetId: id } });
        await tx.budgetItem.createMany({
          data: data.replaceItems.map((item) => ({
            budgetId: id,
            category: item.category,
            plannedAmount: item.plannedAmount,
            notes: item.notes,
          })),
        });
      }

      return tx.budget.update({
        where: { id },
        data: {
          totalAmount: data.totalAmount,
          currency: data.currency,
          alertThresholdPercent: data.alertThresholdPercent,
        },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          executions: { orderBy: { occurredAt: 'desc' } },
        },
      });
    });
  }

  createExecution(data: {
    budgetId: string;
    itemId?: string | null;
    kind: BudgetExecution['kind'];
    amount: Prisma.Decimal;
    occurredAt: Date;
    registeredById: string;
    note?: string | null;
  }): Promise<BudgetExecution> {
    return this.prisma.budgetExecution.create({
      data: {
        budgetId: data.budgetId,
        itemId: data.itemId ?? null,
        kind: data.kind,
        amount: data.amount,
        occurredAt: data.occurredAt,
        registeredById: data.registeredById,
        note: data.note ?? null,
      },
    });
  }

  listExecutions(
    budgetId: string,
    page: number,
    pageSize: number,
  ): Promise<{ total: number; executions: BudgetExecution[] }> {
    const skip = (page - 1) * pageSize;
    return this.prisma.$transaction(async (tx) => {
      const [total, executions] = await Promise.all([
        tx.budgetExecution.count({ where: { budgetId } }),
        tx.budgetExecution.findMany({
          where: { budgetId },
          skip,
          take: pageSize,
          orderBy: { occurredAt: 'desc' },
        }),
      ]);
      return { total, executions };
    });
  }
}
