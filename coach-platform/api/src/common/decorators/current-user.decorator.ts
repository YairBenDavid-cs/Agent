import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/** Mirrors UserRole in the users domain; kept inline so common stays decoupled. */
export type AuthRole = 'user' | 'admin';

export interface AuthenticatedUser {
  userId: string;
  role: AuthRole;
}

/**
 * Injects the authenticated user's identity into a handler.
 * Identity comes from the request (set by JwtAuthGuard) — never from query/body.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.userId) {
      throw new UnauthorizedException('Missing authenticated user.');
    }
    return user;
  },
);
