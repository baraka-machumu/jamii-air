// HTTP pipeline shared by main.ts and the e2e tests (Plan task 2.3), so tests run exactly what
// production runs.
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ApiErrorBody } from './common/errors/error-codes.js';
import { MetricPoint } from './modules/admin/admin.responses.js';
import { AppConfig } from './config/app-config.js';
import { LINK_ROUTES } from './modules/links/links.controller.js';

export const API_PREFIX = 'api/v1';
/** Routes served at the root, outside /api/v1. */
export const LINK_EXCLUDE = LINK_ROUTES;

/**
 * The OpenAPI document, built the same way for the served docs, `npm run openapi` and the tests
 * (Plan task 2.14). ApiErrorBody carries the enum of every error code (the apps translate them).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  // Models referenced only by $ref (not by a decorator type) must be registered here.
  return SwaggerModule.createDocument(app, openApiConfig(), { extraModels: [ApiErrorBody, MetricPoint] });
}

/** Title, description and auth scheme of the OpenAPI document. */
export function openApiConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Jamii Air API')
    .setDescription('Mobile app routes and, under /api/v1/admin, the admin portal (separate auth: tags "admin" and "admin auth").')
    .setVersion('1')
    .addBearerAuth()
    .build();
}

export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.use(helmet()); // SE-02
  app.use(adminCors(config.admin.origin)); // TRD §8.2
  express.useBodyParser('json', { limit: '100kb' }); // SE-05
  express.disable('x-powered-by');
  // Rate limits key on req.ip: behind nginx it must be the client's, not nginx's (Plan 5.4).
  express.set('trust proxy', config.trustProxy);
  app.setGlobalPrefix(API_PREFIX, { exclude: LINK_EXCLUDE }); // API-01; share-link targets at the root (SH-01)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }), // SE-05
  );
  app.useGlobalFilters(new AllExceptionsFilter()); // API-05, SR-07
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, { jsonDocumentUrl: `${API_PREFIX}/openapi.json` });
  }
}

/**
 * CORS for the admin portal only (TRD §8.2): its origin, with credentials (the refresh cookie),
 * on /api/v1/admin routes. Mobile routes never send CORS headers.
 */
function adminCors(origin: string) {
  const prefix = `/${API_PREFIX}/admin/`;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.path.startsWith(prefix) || req.headers.origin !== origin) return next();
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method !== 'OPTIONS') return next();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Admin-Client');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
  };
}
