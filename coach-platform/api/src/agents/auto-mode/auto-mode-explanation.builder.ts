import { Injectable } from '@nestjs/common';
import {
  AutoModeDiff,
  AutoModeRun,
  AutoModeScenario,
  AutoModeTraceEntry,
} from './domain/auto-mode-run.model';

const SCENARIO_HEADLINE: Record<AutoModeScenario, string> = {
  new_week: 'Auto Mode generated next week',
  weekly_targets_edit: 'Auto Mode revised this week’s targets',
  session_edit: 'Auto Mode edited a session',
  session_time_edit: 'Auto Mode rescheduled a session',
};

/**
 * Renders the end-of-run chat message (hard constraint #4: every autonomous
 * write is verbosely explained). Committed runs lead with what changed
 * (`diff`); aborted/failed runs lead with why nothing changed. The full
 * chain-of-thought trace is appended as a collapsible-style list so the user
 * can audit the Coach/Recovery debate without it burying the headline.
 */
@Injectable()
export class AutoModeExplanationBuilder {
  build(run: AutoModeRun): string {
    if (run.status === 'aborted' || run.status === 'failed') {
      return this.buildAbort(run);
    }
    return this.buildCommitted(run);
  }

  private buildCommitted(run: AutoModeRun): string {
    const lines: string[] = [`**${SCENARIO_HEADLINE[run.scenario]}**`, ''];
    const diff = run.diff ?? {};

    if (diff.weeklyTargets) {
      lines.push(...this.renderTargetsDiff(diff.weeklyTargets));
    }
    if (diff.sessions && diff.sessions.length > 0) {
      lines.push(...this.renderSessionsDiff(diff.sessions));
    }
    if (diff.schedule && diff.schedule.length > 0) {
      lines.push(...this.renderScheduleDiff(diff.schedule));
    }
    if (lines.length === 2) {
      lines.push('No changes were needed — everything already fit.');
    }

    lines.push('', this.renderTrace(run.trace));
    return lines.join('\n');
  }

  private buildAbort(run: AutoModeRun): string {
    const reason = run.failureReason ?? 'an unexpected error';
    const lines = [
      `**${SCENARIO_HEADLINE[run.scenario]} — stopped, nothing changed**`,
      '',
      `I backed out of this autonomous run rather than push a change I wasn’t confident in: ${reason}`,
      '',
      'Nothing on your program, calendar, or targets was touched. Let me know how you’d like to proceed — I can retry with tighter constraints, or you can make the change yourself in Plan mode.',
      '',
      this.renderTrace(run.trace),
    ];
    return lines.join('\n');
  }

  private renderTargetsDiff(t: NonNullable<AutoModeDiff['weeklyTargets']>): string[] {
    const before = t.before as { sessionCount: number; totalVolume: number; keyGoals: string[] } | null;
    const after = t.after as { sessionCount: number; totalVolume: number; keyGoals: string[] } | null;
    const lines = ['**Weekly targets:**'];
    if (before && after) {
      lines.push(
        `- Sessions: ${before.sessionCount} → ${after.sessionCount}`,
        `- Volume: ${before.totalVolume} → ${after.totalVolume}`,
        `- Focus: ${after.keyGoals.join(', ')}`,
      );
    } else if (after) {
      lines.push(
        `- ${after.sessionCount} sessions, ${after.totalVolume} total volume`,
        `- Focus: ${after.keyGoals.join(', ')}`,
      );
    }
    lines.push('');
    return lines;
  }

  private renderSessionsDiff(sessions: NonNullable<AutoModeDiff['sessions']>): string[] {
    const lines = [`**Sessions changed (${sessions.length}):**`];
    for (const s of sessions) {
      const before = s.before as { title?: string } | null;
      const after = s.after as { title?: string } | null;
      const title = after?.title ?? before?.title ?? s.sessionId;
      lines.push(`- ${title}`);
    }
    lines.push('');
    return lines;
  }

  private renderScheduleDiff(schedule: NonNullable<AutoModeDiff['schedule']>): string[] {
    const lines = [`**Rescheduled (${schedule.length}):**`];
    for (const s of schedule) {
      const from = s.before ? `${s.before.date} ${s.before.startTime}` : 'unscheduled';
      const to = s.after ? `${s.after.date} ${s.after.startTime}` : 'unscheduled';
      lines.push(`- ${from} → ${to}`);
    }
    lines.push('');
    return lines;
  }

  private renderTrace(trace: AutoModeTraceEntry[]): string {
    if (trace.length === 0) {
      return '';
    }
    const steps = trace.map((t) => `  - _${t.node}_: ${t.summary}`).join('\n');
    return `**How I got there:**\n${steps}`;
  }
}
