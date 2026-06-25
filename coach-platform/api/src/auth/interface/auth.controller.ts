import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Request, Response } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { LoginCommand } from '../application/commands/login.command';
import { LogoutCommand } from '../application/commands/logout.command';
import { RefreshCommand } from '../application/commands/refresh.command';
import { RegisterCommand } from '../application/commands/register.command';
import { AuthResult } from '../application/dto/auth-result';
import { LoginDto } from '../application/dto/login.dto';
import { RegisterDto } from '../application/dto/register.dto';
import { ApiError } from '../../common/errors/api-error';
import { REFRESH_COOKIE } from '../auth.constants';
import { AuthCookieService } from './auth-cookie.service';

/** Identity returned in the body; tokens travel only in httpOnly cookies. */
interface AuthIdentityResponse {
  userId: string;
  role: AuthenticatedUser['role'];
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthIdentityResponse> {
    const result = await this.commandBus.execute<RegisterCommand, AuthResult>(
      new RegisterCommand(dto),
    );
    return this.complete(res, result);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthIdentityResponse> {
    const result = await this.commandBus.execute<LoginCommand, AuthResult>(
      new LoginCommand(dto),
    );
    return this.complete(res, result);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthIdentityResponse> {
    const token = this.readRefreshCookie(req);
    if (!token) throw ApiError.tokenInvalid();
    const result = await this.commandBus.execute<RefreshCommand, AuthResult>(
      new RefreshCommand(token),
    );
    return this.complete(res, result);
  }

  @HttpCode(200)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true }> {
    await this.commandBus.execute(
      new LogoutCommand(this.readRefreshCookie(req)),
    );
    this.cookies.clearAuthCookies(res);
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthIdentityResponse {
    return { userId: user.userId, role: user.role };
  }

  /** Set the cookies and return the body identity for an auth result. */
  private complete(res: Response, result: AuthResult): AuthIdentityResponse {
    this.cookies.setAuthCookies(res, result.tokens);
    return { userId: result.user.userId, role: result.user.role };
  }

  private readRefreshCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
  }
}
