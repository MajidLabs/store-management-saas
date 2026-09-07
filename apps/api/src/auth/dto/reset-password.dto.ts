import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description:
      'The raw token from the reset link (not the hash stored server-side).',
  })
  @IsString()
  token: string;

  @ApiProperty({ example: 'a-new-strong-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
