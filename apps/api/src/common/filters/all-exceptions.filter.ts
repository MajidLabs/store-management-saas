import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = isHttpException ? exception.getResponse() : null;
    const message = isHttpException
      ? typeof responseBody === 'string'
        ? responseBody
        : ((responseBody as any)?.message ?? exception.message)
      : 'Internal server error';

    if (!isHttpException) {
      // request.log is pino-http's request-scoped logger (see LoggerModule in
      // app.module.ts) - using it here keeps 5xx stack traces in the same
      // structured JSON stream as every other log line, tagged with the same
      // requestId, instead of a separate untagged console.error.
      (request as any).log?.error({ err: exception }, 'Unhandled exception');
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error: isHttpException
        ? exception.constructor.name
        : 'InternalServerError',
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.requestId,
    });
  }
}
