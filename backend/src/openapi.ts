// Writes the OpenAPI spec (Plan task 2.14) for the mobile and admin type generators:
//   npm run openapi            → openapi.json (mobile + admin in one document; tags tell them apart)
// Builds the document from the route metadata in preview mode: no database, Redis or storage
// connection is opened, so it runs in CI without the local stack.
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { API_PREFIX, LINK_EXCLUDE, openApiConfig } from './app.setup.js';

async function main() {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  app.setGlobalPrefix(API_PREFIX, { exclude: LINK_EXCLUDE });
  const document = SwaggerModule.createDocument(app, openApiConfig());
  const out = process.argv[2] ?? 'openapi.json';
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${out}: ${Object.keys(document.paths).length} paths`);
  await app.close();
}
await main();
