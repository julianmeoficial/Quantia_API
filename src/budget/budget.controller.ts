import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { BudgetService } from './budget.service';
import {
  CreateBudgetDto,
  CreateBudgetExecutionDto,
  ListBudgetExecutionsQueryDto,
  UpdateBudgetDto,
} from './dto/budget.dto';

@ApiTags('budget')
@ApiBearerAuth()
@Controller({ path: 'projects/:projectId/budget', version: '1' })
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  @Get()
  getBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.budgetService.getBudget(user, projectId);
  }

  @Post()
  createBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBudgetDto,
  ) {
    return this.budgetService.createBudget(user, projectId, dto);
  }

  @Patch()
  updateBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgetService.updateBudget(user, projectId, dto);
  }

  @Post('executions')
  createExecution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBudgetExecutionDto,
  ) {
    return this.budgetService.createExecution(user, projectId, dto);
  }

  @Get('executions')
  listExecutions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListBudgetExecutionsQueryDto,
  ) {
    return this.budgetService.listExecutions(user, projectId, query);
  }
}
