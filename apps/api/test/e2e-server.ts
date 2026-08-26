/**
 * The API as the browser tests see it: the real AppModule, wired the way
 * `main.ts` wires it, with one substitution — MailService writes to a file
 * instead of Resend. Journeys that hinge on a link or a code (activation,
 * magic link, OTP, invitation, password reset) are only testable end to end
 * because of that file.
 */
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';
import { TRPCService } from '../src/trpc/trpc.module';
import { E2eMailbox, createMailServiceStub } from './e2e-mailbox';

const MAILBOX_PATH =
  process.env.E2E_MAILBOX_PATH ?? `${process.cwd()}/../../e2e/.mailbox.json`;

async function bootstrap() {
  const logger = new Logger('E2E');
  const mailbox = new E2eMailbox(MAILBOX_PATH);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(createMailServiceStub(mailbox))
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();

  app.set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3030';
  app.enableCors({ origin: webAppUrl.split(',').map((o) => o.trim()), credentials: true });

  // Same CSRF guard as production: a mutation without the header is a 403 in
  // both places, so tests that forget it fail here the way they would live.
  app.use('/trpc', (req: any, res: any, next: () => void) => {
    if (req.method !== 'GET' && !req.headers['x-trpc-source']) {
      return res.status(403).json({ message: 'Missing x-trpc-source header' });
    }
    next();
  });
  app.use('/trpc', app.get(TRPCService).createMiddleware());

  // Reading the mailbox over HTTP keeps the Playwright side free of any
  // assumption about where the API process put the file.
  app.getHttpAdapter().get('/__e2e__/mailbox', (_req: any, res: any) => res.json(mailbox.read()));
  app.getHttpAdapter().delete('/__e2e__/mailbox', (_req: any, res: any) => {
    mailbox.reset();
    res.json({ ok: true });
  });

  // The REST auth routes are throttled per IP (login 5/min, magic link and OTP
  // 3/min) and every browser test dials from the same loopback address, so a
  // suite exercising more than a handful of auth flows would 429 on itself.
  // Clearing the store puts a test back at zero; the guard itself still runs,
  // and a test that means to exhaust it simply does not call this first.
  app.getHttpAdapter().delete('/__e2e__/throttle', (_req: any, res: any) => {
    // Never `storage.clear()`: the service schedules a timer per hit that reads
    // its own entry back, and a cleared Map makes that timer throw from outside
    // any request — an uncaught exception that takes the process down mid-run.
    // `resetBlockdRequest` zeroes the counter and cancels those timers.
    const service = app.get(ThrottlerStorage) as unknown as {
      storage: Map<string, { totalHits: Map<string, number> }>;
      resetBlockdRequest(key: string, throttlerName: string): void;
    };
    for (const [key, record] of service.storage) {
      for (const throttlerName of record.totalHits.keys()) {
        service.resetBlockdRequest(key, throttlerName);
      }
    }
    res.json({ ok: true });
  });

  const port = Number(process.env.API_PORT ?? 3011);
  await app.listen(port);
  logger.log(`E2E API on http://localhost:${port} — mailbox at ${MAILBOX_PATH}`);
}

void bootstrap();
