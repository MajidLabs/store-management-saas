import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Idempotent } from '../idempotency/idempotent.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.STORE_OWNER, Role.STAFF)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Idempotent()
  @ApiOperation({
    summary:
      'Create an order - decrements stock atomically for every line item. Supports an Idempotency-Key header: a retry with the same key returns the original order instead of creating a second one.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.storeId as string, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List orders - filter by status/date range, paginate',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryOrderDto,
  ) {
    return this.ordersService.findAll(user.storeId as string, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order with its line items' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.findOne(user.storeId as string, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update order status - cancelling restocks its items',
  })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.storeId as string, id, dto);
  }
}
