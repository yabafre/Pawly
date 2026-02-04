/**
 * tRPC NestJS Module
 *
 * Integrates tRPC with NestJS dependency injection.
 * Provides the tRPC middleware factory that can be used in main.ts.
 */
import { Module, Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '@/modules/auth/auth.module';
import { AuthService } from '@/modules/auth/auth.service';
import { appRouter } from './routers/_app';
import { createContext, type TRPCServices } from './context';

/**
 * tRPC Middleware - integrates tRPC with Express/NestJS
 *
 * Creates the Express middleware with NestJS services injected.
 */
@Injectable()
export class TRPCMiddleware implements NestMiddleware {
  private readonly middleware: ReturnType<typeof trpcExpress.createExpressMiddleware>;

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {
    const services: TRPCServices = {
      authService: this.authService,
      jwtService: this.jwtService,
    };

    this.middleware = trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: (opts) => createContext({ ...opts, services }),
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    return this.middleware(req, res, next);
  }
}

/**
 * tRPC Service - provides access to tRPC router and middleware factory
 */
@Injectable()
export class TRPCService {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) { }

  /**
   * Get the services to inject into tRPC context
   *
   * NOTE: CartValidationService is NOT included - it uses REST for storefront.
   */
  getServices(): TRPCServices {
    return {
      authService: this.authService,
      jwtService: this.jwtService,
    };
  }

  /**
   * Create Express middleware for tRPC
   */
  createMiddleware() {
    const services = this.getServices();

    return trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: (opts) => createContext({ ...opts, services }),
    });
  }
}

@Module({
  imports: [
    AuthModule
  ],
  providers: [TRPCService, TRPCMiddleware],
  exports: [TRPCService, TRPCMiddleware],
})
export class TRPCModule { }
