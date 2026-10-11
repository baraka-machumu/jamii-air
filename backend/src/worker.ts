// Worker process (TRD DP-01: same image as the API, `node dist/worker.js`). No HTTP server.
// The queue processors (media, push, maintenance schedule) register in WorkerModule.
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks(); // SIGTERM / SIGINT: close the app, then exit
  // Run until stopped. Once the queue processors exist they keep the event loop busy anyway.
  setInterval(() => undefined, 60_000);
  app.get(Logger).log('Worker started');
}
await bootstrap();
