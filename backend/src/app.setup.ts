// HTTP pipeline shared by main.ts and the e2e tests (Plan task 2.3), so tests run exactly what
// production runs.
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { AppConfig } from './config/app-config.js';
import { LINK_ROUTES } from './modules/links/links.controller.js';

export const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.use(helmet()); // SE-02
  app.use(adminCors(config.admin.origin)); // TRD §8.2
  express.useBodyParser('json', { limit: '100kb' }); // SE-05
  express.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX, { exclude: LINK_ROUTES }); // API-01; share-link targets at the root (SH-01)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }), // SE-05
  );
  app.useGlobalFilters(new AllExceptionsFilter()); // API-05, SR-07
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Jamii Air API').setVersion('1').addBearerAuth().build(),
    );
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
