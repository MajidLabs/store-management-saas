import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { SetStoreSuspendedDto } from './dto/set-store-suspended.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Audited } from '../audit/audited.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('admin/stores')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({
    summary: 'List all stores on the platform, paginated (SuperAdmin only)',
  })
  findAll(@Query() query: PaginationQueryDto) {
    return this.adminService.findAllStores(query);
  }

  @Patch(':id/suspend')
  @Audited('STORE_SUSPENSION_CHANGED')
  @ApiOperation({
    summary:
      'Suspend or reactivate a store - suspended stores cannot log in (SuperAdmin only)',
  })
  setSuspended(@Param('id') id: string, @Body() dto: SetStoreSuspendedDto) {
    return this.adminService.setSuspended(id, dto.suspended);
  }
}
