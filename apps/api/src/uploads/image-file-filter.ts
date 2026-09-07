import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function imageFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(
      new BadRequestException('Only PNG, JPEG, or WEBP images are allowed'),
      false,
    );
    return;
  }
  callback(null, true);
}

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
