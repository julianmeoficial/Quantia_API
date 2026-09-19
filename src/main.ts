import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createCorsOriginDelegate, parseCorsOrigins } from './common/cors.util';
import { EnvConfig } from './config/env.schema';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // Railway (and other reverse proxies) terminate TLS; trust X-Forwarded-*.
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance() as {
    set?: (key: string, value: unknown) => void;
  };
  instance.set?.('trust proxy', 1);

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

  const configService = app.get(ConfigService<EnvConfig, true>);
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
