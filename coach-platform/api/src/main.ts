import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Auth tokens travel in httpOnly cookies; parse them into req.cookies.
  app.use(cookieParser());

  // Cross-origin browser access. Disabled unless CORS_ORIGIN is set, since dev
  // runs the frontend through a same-origin Vite proxy. Credentials are required
  // so the auth cookies are sent; that forbids a wildcard origin.
  const corsOrigin = app.get(ConfigService).get<string>('CORS_ORIGIN');
  if (corsOrigin) {
    app.enableCors({
      origin: corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    });
  }

  // Reject unknown fields and coerce types globally — DTOs are the contract.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Single, uniform error envelope for every thrown error.
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
