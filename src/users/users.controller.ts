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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@quantia/contracts';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { PaginatedUserDirectoryResponseDto } from './dto/paginated-user-directory-response.dto';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findById(user.id);
  }

  @Get()
  @Roles(RoleName.ADMINISTRADOR)
  findAll(@Query() query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.usersService.findAll(page, pageSize);
  }

  @Get('directory')
  @Roles(RoleName.ADMINISTRADOR, RoleName.COORDINADOR)
  @ApiOperation({
    summary: 'Search active users to add as project members',
    description:
      'Returns only id, full name and e-mail of active users. Requires a search term (min 2 chars); never lists the whole user base.',
  })
  @ApiOkResponse({ type: PaginatedUserDirectoryResponseDto })
  directory(
    @Query() query: UserDirectoryQueryDto,
  ): Promise<PaginatedUserDirectoryResponseDto> {
    return this.usersService.searchDirectory(query);
  }

  @Get(':id')
  @Roles(RoleName.ADMINISTRADOR)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(RoleName.ADMINISTRADOR)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(RoleName.ADMINISTRADOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.ADMINISTRADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.usersService.remove(id);
  }
}
