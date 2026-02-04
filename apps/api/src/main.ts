import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from '@/common/interceptors/request-id.interceptor';
import { TRPCService } from './trpc/trpc.module';
import type { EnvConfig } from '@/config/index';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService<EnvConfig, true>);
    const port = configService.get('PORT', { infer: true });

    // Global validation pipe with transformation enabled
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        whitelist: true,
        forbidNonWhitelisted: false,
      })
    );

    // Global interceptor for request ID tracking
    app.useGlobalInterceptors(new RequestIdInterceptor());

    // Enable graceful shutdown
    app.enableShutdownHooks();

    // Enable CORS for dashboard
    const webAppUrl = configService.get('WEB_APP_URL', { infer: true });
    app.enableCors({
      origin: webAppUrl,
      credentials: true,
    });

    // tRPC Middleware Setup
    const trpcService = app.get(TRPCService);
    app.use('/trpc', trpcService.createMiddleware());
    logger.log('tRPC endpoint available at: /trpc');

    // Swagger/OpenAPI Setup
    const config = new DocumentBuilder()
      .setTitle('Pawly API')
      .setDescription(
        'Pawly - Open-source multi-tenant SaaS e-commerce platform API. ' +
        'Built with NestJS, featuring JWT authentication, multi-tenancy, and the Profit Engine.'
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
        'JWT-auth'
      )
      .addTag('auth', 'Authentication endpoints (login, logout, refresh)')
      .addTag('health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'Pawly API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
      },
    });

    await app.listen(port);

    logger.log(`Pawly API is running on: http://localhost:${port}`);
    logger.log(`Health check available at: http://localhost:${port}/health`);
    logger.log(`Swagger docs available at: http://localhost:${port}/docs`);
    logger.log(`tRPC endpoint available at: http://localhost:${port}/trpc`);
  } catch (error) {
    logger.error('Failed to start Pawly API', error);
    process.exit(1);
  }
}

void bootstrap();
