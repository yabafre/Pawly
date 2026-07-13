jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation((opts: Record<string, unknown>) => ({
    options: opts,
    end: jest.fn(),
  })),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(_opts: unknown) {}
  },
}));
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn(),
}));

import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaService } from './prisma.service';
import type { EnvConfig } from '@/config/index';

const poolMock = Pool as unknown as jest.Mock;

const configService = {
  get: jest
    .fn()
    .mockReturnValue(
      'postgresql://placeholder:placeholder@localhost:5432/placeholder',
    ),
} as unknown as ConfigService<EnvConfig, true>;

describe('PrismaService — pg Pool sizing', () => {
  beforeEach(() => {
    poolMock.mockClear();
  });

  afterEach(() => {
    delete process.env.DB_POOL_MAX;
  });

  it('constructs the Pool with an explicit max of 10 by default', () => {
    new PrismaService(configService);

    expect(poolMock).toHaveBeenCalledTimes(1);
    expect(poolMock.mock.calls[0][0]).toMatchObject({ max: 10 });
  });

  it('honors the DB_POOL_MAX environment variable', () => {
    process.env.DB_POOL_MAX = '5';

    new PrismaService(configService);

    expect(poolMock.mock.calls[0][0]).toMatchObject({ max: 5 });
  });
});
