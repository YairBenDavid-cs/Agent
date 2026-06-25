import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  ConnectGarminDto,
  ConnectGoogleCalendarDto,
  ConnectTelegramDto,
} from '../application/dto/connect-integration.dto';
import { IntegrationStatusResponse } from '../application/dto/integration-status.response';
import { IntegrationsService } from '../application/integrations.service';

/**
 * Connect/replace credentials and read connection status. These endpoints only
 * ever ACCEPT secrets or RETURN secret-free status — decrypted credentials are
 * never reachable through this controller.
 */
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IntegrationStatusResponse[]> {
    return this.integrations.getStatuses(user.userId);
  }

  @Put('garmin')
  @HttpCode(204)
  async connectGarmin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectGarminDto,
  ): Promise<void> {
    await this.integrations.connectGarmin(user.userId, dto);
  }

  /** Consent URL the browser is redirected to in order to start Google OAuth. */
  @Get('google-calendar/auth-url')
  googleCalendarAuthUrl(): { url: string } {
    return this.integrations.getGoogleCalendarAuthUrl();
  }

  @Put('google-calendar')
  @HttpCode(204)
  async connectGoogleCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectGoogleCalendarDto,
  ): Promise<void> {
    await this.integrations.connectGoogleCalendar(user.userId, dto);
  }

  @Put('telegram')
  @HttpCode(204)
  async connectTelegram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConnectTelegramDto,
  ): Promise<void> {
    await this.integrations.connectTelegram(user.userId, dto);
  }
}
