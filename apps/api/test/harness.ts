/**
 * One Nest app, wired the way production wires it, talking to the disposable
 * Postgres — with MailService swapped for the capture stub. Suites that assert
 * "a mail went out" read `mailbox`; suites that assert a contract just use
 * `http`.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TRPCService } from '../src/trpc/trpc.module';
import { E2eMailbox, createMailServiceStub, type CapturedMail } from './e2e-mailbox';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestHarness {
  app: INestApplication;
  prisma: PrismaService;
  mailbox: E2eMailbox;
  /** Raw supertest agent — use for REST routes under /auth and /api. */
  http: () => request.Agent;
  /** Calls a tRPC mutation the way the web app does, headers included. */
  trpcMutation: (path: string, input: unknown, token?: string) => request.Test;
  /** Calls a tRPC query with the same conventions. */
  trpcQuery: (path: string, input: unknown, token?: string) => request.Test;
  close: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const mailbox = new E2eMailbox(
    join(tmpdir(), `pawly-integration-mailbox-${process.pid}.json`),
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(createMailServiceStub(mailbox))
    .compile();

  // `rawBody: true` mirrors main.ts — the Stripe webhook route reads
  // `req.rawBody` to verify the HMAC signature, and without it every signed
  // payload would 400 on "Missing raw body" instead of reaching the handler.
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // The CSRF header guard lives in main.ts, not in a Nest provider, so it has
  // to be re-declared here or every mutation test would pass for the wrong
  // reason (never exercising the guard the browser has to satisfy).
  app.use('/trpc', (req: any, res: any, next: () => void) => {
    if (req.method !== 'GET' && !req.headers['x-trpc-source']) {
      return res.status(403).json({ message: 'Missing x-trpc-source header' });
    }
    next();
  });
  app.use('/trpc', app.get(TRPCService).createMiddleware());
  await app.init();

  const server = () => app.getHttpServer();
  const auth = (req: request.Test, token?: string) =>
    token ? req.set('Authorization', `Bearer ${token}`) : req;

  return {
    app,
    prisma: app.get(PrismaService),
    mailbox,
    http: () => request(server()),
    trpcMutation: (path, input, token) =>
      auth(
        request(server())
          .post(`/trpc/${path}`)
          .set('x-trpc-source', 'integration-test')
          .send({ json: input }),
        token,
      ),
    trpcQuery: (path, input, token) =>
      auth(
        request(server())
          .get(`/trpc/${path}`)
          .query({ input: JSON.stringify({ json: input }) }),
        token,
      ),
    close: async () => {
      await app.close();
    },
  };
}

/** Signs in over the real endpoint so the token carries real claims. */
export async function login(
  harness: TestHarness,
  email: string,
  password: string,
): Promise<string> {
  const res = await harness.http().post('/auth/login').send({ email, password }).expect(201);
  return res.body.access_token as string;
}

export type { CapturedMail };
