import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetStoreSuspendedDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  suspended: boolean;
}
