import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CategoriesModule } from '../categories/categories.module';
import { STORAGE_PROVIDER } from '../uploads/storage-provider.interface';
import { LocalDiskStorageProvider } from '../uploads/local-disk-storage.provider';
import { S3StorageProvider } from '../uploads/s3-storage.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    CategoriesModule,
    ConfigModule,
  ],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('STORAGE_PROVIDER') === 's3'
          ? new S3StorageProvider(config)
          : new LocalDiskStorageProvider(),
    },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
