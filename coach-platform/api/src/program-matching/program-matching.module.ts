import { Module } from '@nestjs/common';
import { PlannedSessionsModule } from '../planned-sessions/planned-sessions.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MatchOnIngestionListener } from './application/match-on-ingestion.listener';
import { SessionMatcherService } from './application/session-matcher.service';

/**
 * Wires the planned↔actual matcher. Depends on the sessions and planned-sessions
 * contexts via their exported repository ports, and subscribes to the ingestion
 * event. Owns no persistence of its own.
 */
@Module({
  imports: [SessionsModule, PlannedSessionsModule],
  providers: [SessionMatcherService, MatchOnIngestionListener],
  exports: [SessionMatcherService],
})
export class ProgramMatchingModule {}
