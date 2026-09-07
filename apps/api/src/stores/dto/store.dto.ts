import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: "Majid's Corner Shop" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}

export class InviteStaffDto {
  @ApiProperty({ example: 'staff@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'a-strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class UpdateStaffDto extends PartialType(InviteStaffDto) {}
