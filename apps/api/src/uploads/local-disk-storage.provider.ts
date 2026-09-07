import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  private readonly uploadsDir = path.join(process.cwd(), 'uploads');

  async upload(file: Buffer, key: string): Promise<{ url: string }> {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    const safeKey = path.basename(key); // defence in depth against path traversal in the key
    await fs.writeFile(path.join(this.uploadsDir, safeKey), file);
    return { url: `/uploads/${safeKey}` };
  }
}
