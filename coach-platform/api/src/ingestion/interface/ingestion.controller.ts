import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { IngestionOrchestrator } from '../application/ingestion.orchestrator';
import { IngestionSummary } from '../application/ingestion.summary';
import { TriggerIngestionDto } from './dto/trigger-ingestion.dto';

/**
 * Manual, on-demand trigger for the authenticated user (the design's "fetch what
 * I need on demand"). The daily scheduler runs the same orchestrator unattended.
 */
@Controller('ingestion')
export class IngestionController {
  constructor(private readonly orchestrator: IngestionOrchestrator) {}

  @Post('run')
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerIngestionDto,
  ): Promise<IngestionSummary> {
    const range = this.resolveRange(dto);
    return this.orchestrator.runForUser(user.userId, range);
  }

  private resolveRange(
    dto: TriggerIngestionDto,
  ): { from: string; to: string } | undefined {
    if (!dto.from && !dto.to) return undefined;
    if (!dto.from || !dto.to) {
      throw new BadRequestException(
        'Provide both "from" and "to", or neither.',
      );
    }
    if (dto.from > dto.to) {
      throw new BadRequestException('"from" must not be after "to".');
    }
    return { from: dto.from, to: dto.to };
  }
}
