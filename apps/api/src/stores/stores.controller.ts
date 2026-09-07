import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import {
  UpdateStoreDto,
  InviteStaffDto,
  UpdateStaffDto,
} from './dto/store.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Audited } from '../audit/audited.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('stores')
@ApiBearerAuth()
@Controller('stores/me')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @Roles(Role.STORE_OWNER, Role.STAFF)
  @ApiOperation({ summary: 'Get the current store' })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.findMine(user.storeId as string);
  }

  @Patch()
  @Roles(Role.STORE_OWNER)
  @Audited('STORE_SETTINGS_UPDATED')
  @ApiOperation({ summary: 'Update store settings (owner only)' })
  updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.updateMine(user.storeId as string, dto);
  }

  @Get('staff')
  @Roles(Role.STORE_OWNER)
  @ApiOperation({ summary: 'List staff for the current store (owner only)' })
  listStaff(@CurrentUser() user: AuthenticatedUser) {
    return this.storesService.listStaff(user.storeId as string);
  }

  @Post('staff')
  @Roles(Role.STORE_OWNER)
  @Audited('STAFF_INVITED')
  @ApiOperation({
    summary:
      "Invite a staff member - blocked once the plan's staff limit is reached",
  })
  inviteStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteStaffDto,
  ) {
    return this.storesService.inviteStaff(user.storeId as string, dto);
  }

  @Patch('staff/:id')
  @Roles(Role.STORE_OWNER)
  @Audited('STAFF_UPDATED')
  @ApiOperation({ summary: 'Update a staff member (owner only)' })
  updateStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.storesService.updateStaff(user.storeId as string, id, dto);
  }

  @Delete('staff/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.STORE_OWNER)
  @Audited('STAFF_REMOVED')
  @ApiOperation({ summary: 'Remove a staff member (owner only)' })
  removeStaff(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.storesService.removeStaff(user.storeId as string, id);
  }
}
