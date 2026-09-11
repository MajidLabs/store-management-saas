import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- cookie-parser is CJS; a standard import risks changing its interop shape (app.use(cookieParser()) expects a callable, not { default: fn }) - not worth the runtime risk to satisfy this rule.
import cookieParser = require('cookie-parser');
import * as path from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true, // hold logs until the pino logger below takes over, so nothing before it is lost
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.use(cookieParser());
  app.use(
    helmet({
      // Swagger UI (served at /api/docs) needs inline scripts/styles to
      // render; disabling CSP here rather than hand-tuning a policy that
      // would otherwise break the docs page this project explicitly wants
      // enabled. The JSON API itself doesn't render any HTML, so this is a
      // narrow, deliberate trade-off, not a blanket opt-out.
      contentSecurityPolicy: false,
    }),
  );
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    // Helmet's default Cross-Origin-Resource-Policy is "same-origin", which is
    // unrelated to CORS and independently blocks the browser from embedding
    // these images from the web app's origin (e.g. <img src="http://api-host/uploads/...">
    // in next/image with `unoptimized`). CORS headers alone (app.enableCors)
    // do not affect this - it must be overridden specifically for this path.
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Store Management SaaS API')
    .setDescription('REST API for the multi-tenant store management platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
