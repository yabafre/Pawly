import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from '@/common/interceptors/request-id.interceptor';
import { rateLimitHitCounter } from '@/common/metrics';
import { TRPCService } from './trpc/trpc.module';
import { RedisService } from './redis';
import type { EnvConfig } from '@/config/index';

// Simple in-memory rate limiter for tRPC endpoints
function createTrpcRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Periodic cleanup of expired entries to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits) {
      if (record.resetAt < now) {
        hits.delete(key);
      }
    }
  }, windowMs * 2);
  // Allow process to exit without waiting for cleanup
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req: { ip?: string }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const record = hits.get(key);
    if (!record || record.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count++;
    if (record.count > limit) {
      rateLimitHitCounter.add(1, { endpoint: 'trpc' });
      return res.status(429).json({ message: 'Too many requests to tRPC endpoint' });
    }
    return next();
  };
}

async function initializeTracing() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return;
  }

  const logger = new Logger('Tracing');

  try {
    const { setupTracing } = await import('./tracing.js');
    setupTracing();
    logger.log('OpenTelemetry initialized');
  } catch (error) {
    logger.error(
      'OpenTelemetry initialization failed; continuing without tracing',
      error instanceof Error ? error.stack : String(error)
    );
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    await initializeTracing();

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      rawBody: true,
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService<EnvConfig, true>);
    const port = configService.get('API_PORT', { infer: true });

    // Trust first proxy hop (Dokploy/Nginx) for correct req.ip
    app.set('trust proxy', 1);

    // Security headers
    app.use(helmet());

    // Global validation pipe with transformation enabled
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    );

    // Global interceptor for request ID tracking
    app.useGlobalInterceptors(new RequestIdInterceptor());

    // Enable graceful shutdown
    app.enableShutdownHooks();

    // Enable CORS for dashboard (supports comma-separated origins)
    const webAppUrl = configService.get('WEB_APP_URL', { infer: true });
    const allowedOrigins = webAppUrl.split(',').map((o: string) => o.trim());
    app.enableCors({
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
    });

    // tRPC CSRF protection: require custom header on mutation requests
    // Browsers won't send custom headers on cross-origin requests without CORS preflight
    app.use('/trpc', (req: any, res: any, next: () => void) => {
      if (req.method !== 'GET' && !req.headers['x-trpc-source']) {
        return res.status(403).json({ message: 'Missing x-trpc-source header' });
      }
      next();
    });

    // tRPC rate limiting (60 req/60s per IP — uses Redis when available, in-memory fallback)
    const redisService = app.get(RedisService);
    if (redisService.isAvailable) {
      app.use('/trpc', async (req: any, res: any, next: () => void) => {
        const key = `rl:trpc:${req.ip ?? 'unknown'}`;
        const count = await redisService.incr(key, 60);
        if (count > 60) {
          rateLimitHitCounter.add(1, { endpoint: 'trpc' });
          return res.status(429).json({ message: 'Too many requests to tRPC endpoint' });
        }
        next();
      });
      logger.log('tRPC rate limiter: Redis-backed');
    } else {
      app.use('/trpc', createTrpcRateLimiter(60, 60_000));
      logger.log('tRPC rate limiter: in-memory fallback');
    }

    // tRPC Middleware Setup
    const trpcService = app.get(TRPCService);
    app.use('/trpc', trpcService.createMiddleware());
    logger.log('tRPC endpoint available at: /trpc');

    // Swagger/OpenAPI Setup (disabled in production)
    if (configService.get('NODE_ENV') !== 'production') {
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
    logger.log('Swagger docs available at: /docs');
    }

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
