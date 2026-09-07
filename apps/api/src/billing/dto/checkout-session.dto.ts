import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { Plan } from '../../common/enums/plan.enum';

export class CreateCheckoutSessionDto {
  @ApiProperty({ enum: Plan, example: Plan.PRO })
  @IsEnum(Plan)
  targetPlan: Plan;

  @ApiProperty({ example: 'http://localhost:3001/billing/success' })
  @IsString()
  @MinLength(1)
  successUrl: string;

  @ApiProperty({ example: 'http://localhost:3001/billing/cancel' })
  @IsString()
  @MinLength(1)
  cancelUrl: string;
}
