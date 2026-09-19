/**
 * Exports the NestJS OpenAPI document to openapi/openapi.json without listening.
 * Requires the same env vars as a normal boot (DB + Redis reachable).
 *
 * Usage: npm run openapi:export
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Quantia API')
    .setDescription(
      'Research project management API (INNOVATEK\'S / GITEMOS). Handoff artifact for Security / pentest (ENG-126).',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outDir = join(process.cwd(), 'openapi');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'openapi.json');
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outFile}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
