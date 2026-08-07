import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import compression from 'compression';

async function bootstrap() {
  // rawBody: true stores the raw request body buffer on req.rawBody so the
  // Razorpay webhook controller can verify HMAC signatures without re-stringifying.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useWebSocketAdapter(new IoAdapter(app));

  // Enables SIGTERM/SIGINT hooks so Bull queue workers drain before process exits
  app.enableShutdownHooks();

  app.use(cookieParser());
  app.use(compression({
    threshold: parseInt(process.env.RESPONSE_COMPRESSION_THRESHOLD_BYTES ?? '1024', 10),
  }));

  if (process.env.STORAGE_DRIVER === 'local') {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    app.use('/uploads', express.static(uploadsDir, {
      etag: true,
      lastModified: true,
      maxAge: process.env.LOCAL_UPLOADS_CACHE_MAX_AGE ?? '1d',
    }));
  }

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Ai-HRMS API')
    .setDescription('AI Hotel Workforce Management System — Phase 1')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addCookieAuth('refresh_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.getHttpAdapter().get('/', (_req: any, res: any) => {
    res.json({ name: 'Ai-HRMS API', version: '1.0', docs: '/api/docs', health: 'ok' });
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Ai-HRMS Backend running on http://localhost:${port}`);
  console.log(`API Docs: http://localhost:${port}/api/docs`);
}
bootstrap();
