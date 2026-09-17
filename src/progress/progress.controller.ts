import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import {
  CreateProgressDto,
  ListProgressQueryDto,
  UpdateProgressDto,
} from './dto/progress.dto';
import { ProgressService } from './progress.service';

@ApiTags('progress')
@ApiBearerAuth()
@Controller({ path: 'projects/:projectId/progress', version: '1' })
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListProgressQueryDto,
  ) {
    return this.progressService.findAll(user, projectId, query);
  }

  @Get(':progressId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('progressId', ParseUUIDPipe) progressId: string,
  ) {
    return this.progressService.findOne(user, projectId, progressId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProgressDto,
  ) {
    return this.progressService.create(user, projectId, dto);
  }

  @Patch(':progressId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('progressId', ParseUUIDPipe) progressId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progressService.update(user, projectId, progressId, dto);
  }

  @Delete(':progressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('progressId', ParseUUIDPipe) progressId: string,
  ): Promise<void> {
    await this.progressService.remove(user, projectId, progressId);
  }
}
