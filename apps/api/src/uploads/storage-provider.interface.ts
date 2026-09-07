export interface StorageProvider {
  upload(file: Buffer, key: string): Promise<{ url: string }>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
