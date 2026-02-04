import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { AuthService } from '@/modules/auth/auth.service';
import type { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '@pawly/types';

export interface TRPCServices {
  authService: AuthService;
  jwtService: JwtService;
}

export async function createContext(
  opts: CreateExpressContextOptions & { services: TRPCServices },
) {
  const { req, services } = opts;
  let user: AuthenticatedUser | null = null;

  // Extract JWT from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = services.jwtService.verify(token);
      user = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        clinicId: payload.clinicId,
      };
    } catch {
      // Invalid token - user remains null
    }
  }

  return {
    req,
    user,
    ...services,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
export type TRPCContext = Context;
