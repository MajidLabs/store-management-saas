import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from '../../stores/entities/store.entity';
import { StoreSuspensionGuard } from './store-suspension.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  providers: [StoreSuspensionGuard],
  exports: [StoreSuspensionGuard],
})
export class StoreSuspensionGuardModule {}
