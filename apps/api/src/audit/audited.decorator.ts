import { SetMetadata } from '@nestjs/common';

export const AUDITED_ACTION_KEY = 'auditedAction';

/**
 * Marks a route as generating an AuditLog row on success (see
 * AuditInterceptor). `action` should be a short, stable, SCREAMING_SNAKE_
 * CASE identifier (e.g. 'PRODUCT_PRICE_CHANGED') - stable because these
 * values get written permanently into audit_logs and read back much later;
 * renaming one after the fact means old rows and new rows disagree about
 * what the same action is called.
 */
export const Audited = (action: string) =>
  SetMetadata(AUDITED_ACTION_KEY, action);
