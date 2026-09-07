import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  create(storeId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.categories.save(
      this.categories.create({ storeId, name: dto.name }),
    );
  }

  findAll(storeId: string): Promise<Category[]> {
    return this.categories.find({ where: { storeId }, order: { name: 'ASC' } });
  }

  async findOne(storeId: string, id: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id, storeId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(
    storeId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOne(storeId, id);
    Object.assign(category, dto);
    return this.categories.save(category);
  }

  async remove(storeId: string, id: string): Promise<void> {
    const category = await this.findOne(storeId, id);
    await this.categories.remove(category);
  }
}
