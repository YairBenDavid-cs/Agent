import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { CreateCredentialsHandler } from './application/commands/create-credentials.handler';
import { LoginHandler } from './application/commands/login.handler';
import { LogoutHandler } from './application/commands/logout.handler';
import { RefreshHandler } from './application/commands/refresh.handler';
import { RegisterHandler } from './application/commands/register.handler';
import { SessionIssuer } from './application/services/session-issuer.service';
import { AUTH_CREDENTIALS_REPOSITORY } from './domain/auth-credentials.repository.port';
import { AUTH_SESSIONS_REPOSITORY } from './domain/auth-sessions.repository.port';
import { PASSWORD_HASHER } from './domain/password-hasher.port';
import { TOKEN_SERVICE } from './domain/token-service.port';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { AuthCredentialsRepository } from './infrastructure/auth-credentials.repository';
import {
  AuthCredentials,
  AuthCredentialsSchema,
} from './infrastructure/auth-credentials.schema';
import { AuthSessionsRepository } from './infrastructure/auth-sessions.repository';
import {
  AuthSession,
  AuthSessionSchema,
} from './infrastructure/auth-session.schema';
import { JwtStrategy } from './infrastructure/jwt.strategy';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { AuthCookieService } from './interface/auth-cookie.service';
import { AuthController } from './interface/auth.controller';

const CommandHandlers = [
  RegisterHandler,
  LoginHandler,
  RefreshHandler,
  LogoutHandler,
  CreateCredentialsHandler,
];

@Module({
  imports: [
    CqrsModule,
    PassportModule,
    // Secrets/TTLs are supplied per-call by JwtTokenService, so no global config.
    JwtModule.register({}),
    UsersModule,
    MongooseModule.forFeature([
      { name: AuthCredentials.name, schema: AuthCredentialsSchema },
      { name: AuthSession.name, schema: AuthSessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CREDENTIALS_REPOSITORY, useClass: AuthCredentialsRepository },
    { provide: AUTH_SESSIONS_REPOSITORY, useClass: AuthSessionsRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    JwtStrategy,
    SessionIssuer,
    AuthCookieService,
    ...CommandHandlers,
  ],
})
export class AuthModule {}
