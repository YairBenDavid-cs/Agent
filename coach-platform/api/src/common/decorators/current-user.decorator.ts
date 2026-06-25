import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
}

/**
 * Injects the authenticated user's identity into a handler.
 * Identity comes from the request (set by the auth guard) — never from query/body.
 *
 * NOTE: AuthModule + JwtAuthGuard are the next milestone. Until then, route
 * protection must be wired before these read endpoints are exposed publicly.
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
