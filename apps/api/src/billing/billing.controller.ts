import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/checkout-session.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Public } from '../common/decorators/public.decorator';
import { Idempotent } from '../idempotency/idempotent.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('subscription')
  @Roles(Role.STORE_OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the current store's plan and status" })
  getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSubscription(user.storeId as string);
  }

  @Post('checkout-session')
  @Roles(Role.STORE_OWNER)
  @Idempotent()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start a plan upgrade (mock: applies instantly; Stripe: redirect to real checkout). Supports an Idempotency-Key header: a retry with the same key returns the original session instead of opening a second one.',
  })
  createCheckoutSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(
      user.storeId as string,
      dto,
    );
  }

  @Public()
  @Post('webhook')
  @ApiOperation({
    summary:
      'Payment provider webhook - authenticated via signature, not a JWT',
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    await this.billingService.handleWebhook(req.rawBody, signature ?? '');
    return { received: true };
  }
}
