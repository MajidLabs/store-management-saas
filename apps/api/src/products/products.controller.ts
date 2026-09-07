import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../uploads/storage-provider.interface';
import {
  imageFileFilter,
  MAX_IMAGE_SIZE_BYTES,
} from '../uploads/image-file-filter';
import { matchesImageSignature } from '../uploads/image-signature.util';
import { Audited } from '../audit/audited.decorator';

@ApiTags('products')
@ApiBearerAuth()
@Roles(Role.STORE_OWNER, Role.STAFF)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Post()
  @Audited('PRODUCT_CREATED')
  @ApiOperation({ summary: 'Create a product' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user.storeId as string, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List products - search, filter by category/price range, paginate',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryProductDto,
  ) {
    return this.productsService.findAll(user.storeId as string, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.findOne(user.storeId as string, id);
  }

  @Patch(':id')
  @Audited('PRODUCT_UPDATED')
  @ApiOperation({ summary: 'Update a product' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.storeId as string, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited('PRODUCT_DELETED')
  @ApiOperation({ summary: 'Delete a product' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.productsService.remove(user.storeId as string, id);
  }

  @Post(':id/image')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a product image (PNG/JPEG/WEBP, max 5MB)' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Confirms the product exists and belongs to this store before touching disk.
    await this.productsService.findOne(user.storeId as string, id);

    // imageFileFilter only checked the client-supplied Content-Type header -
    // trivial to spoof. This checks the actual bytes.
    if (!matchesImageSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        "File content doesn't match its declared type - only real PNG, JPEG, or WEBP images are allowed",
      );
    }

    const extension = path.extname(file.originalname) || '.jpg';
    const key = `${id}-${randomUUID()}${extension}`;
    const { url } = await this.storage.upload(file.buffer, key);

    return this.productsService.setImage(user.storeId as string, id, url);
  }
}
