import { SetMetadata } from '@nestjs/common';
import { AuthRole } from './current-user.decorator';

export const ROLES_KEY = 'roles';

/** Restrict a route to the listed roles. Enforced by RolesGuard. */
export const Roles = (...roles: AuthRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
