import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  json,
  urlencoded,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createCorsOriginDelegate, parseCorsOrigins } from './common/cors.util';
import { assertJsonDepth } from './common/middleware/json-depth.util';
import { EnvConfig } from './config/env.schema';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<EnvConfig, true>);
  const bodyLimit = configService.get('HTTP_JSON_BODY_LIMIT', { infer: true });
  const maxDepth = configService.get('HTTP_JSON_MAX_DEPTH', { infer: true });

  // Manual body parser so we can set size limit and preserve rawBody for Notion HMAC.
  app.use(
    json({
      limit: bodyLimit,
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.body &&
      typeof req.body === 'object' &&
      !assertJsonDepth(req.body, maxDepth)
    ) {
      res.status(400).json({
        statusCode: 400,
        message: 'JSON body exceeds maximum depth',
        path: req.url,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    next();
  });

  // Railway (and other reverse proxies) terminate TLS; trust X-Forwarded-*.
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance() as {
    set?: (key: string, value: unknown) => void;
    disable?: (key: string) => void;
  };
  instance.set?.('trust proxy', 1);
  instance.disable?.('x-powered-by');

  // S4 / ENG-130: security headers. CSP disabled — this is a JSON API, not HTML.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: {
        maxAge: 15_552_000,
        includeSubDomains: true,
      },
    }),
  );

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const corsOrigins = parseCorsOrigins(
    configService.get('CORS_ORIGINS', { infer: true }),
  );
  const allowVercelPreview = configService.get('CORS_VERCEL_PREVIEW', {
    infer: true,
  });

  app.enableCors({
    origin: createCorsOriginDelegate(corsOrigins, allowVercelPreview),
    credentials: true,
  });

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Swagger UI only for local/dev/test (NODE_ENV !== production).
  // Staging and production both run NODE_ENV=production (APP_ENV separates them);
  // use committed openapi/openapi.json for pentest tooling.
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Quantia API')
      .setDescription('Research project management API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
