import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Observable, concatMap } from 'rxjs';
import { AuditLog } from './audit-log.entity';
import { AUDITED_ACTION_KEY } from './audited.decorator';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * Runs only for routes marked @Audited('ACTION_NAME'). Writes only on
 * success - a failed request (validation error, not-found, forbidden)
 * didn't actually change anything, so there's nothing to audit; NestJS
 * interceptors only reach the success path here anyway (an exception
 * skips the pipe below and goes straight to the exception filter).
 *
 * Target ID comes from the route's :id param when present (update/delete
 * routes); for a create route with no :id in the URL, it comes from the
 * response body's own .id field instead, once the handler has actually
 * run - this is why the write happens in concatMap after next.handle(),
 * not before.
 *
 * The full request body is stored as metadata verbatim - this captures
 * the new state (e.g. a product's new price) but not a before/after diff;
 * computing an actual diff would need reading the row before the update
 * runs, which is a real improvement worth making later but adds a second
 * query to every audited route for now more complexity than this pass
 * scoped in.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(
      AUDITED_ACTION_KEY,
      context.getHandler(),
    );
    if (!action) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as unknown as { user?: AuthenticatedUser }).user;

    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        if (user) {
          const rawParamId = req.params?.id;
          const paramId =
            typeof rawParamId === 'string' ? rawParamId : undefined;
          const targetId =
            paramId ?? (body as { id?: string } | undefined)?.id ?? null;
          await this.auditLogs.insert({
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            storeId: user.storeId,
            action,
            targetId,
            metadata: req.body ?? null,
          });
        }
        return body;
      }),
    );
  }
}
