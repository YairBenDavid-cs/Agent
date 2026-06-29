import { Injectable, Logger } from '@nestjs/common';
import { PreferenceItemDto } from '../../personalization/application/dto/preference-item.dto';
import { EventDiscipline } from '../../personalization/domain/preference-event.model';
import { RunType } from '../../training/domain/training-profile.model';
import { PendingCandidate } from '../conversation/domain/conversation.model';
import { AnyAgentTool, defineTool } from '../shared/llm/agent-tool';
import { AgenticLoopRuntime } from '../shared/llm/agentic-loop.runtime';
import { CapturedSignal } from './assistant.contracts';
import { confidenceForLane, signalToPreferenceItem } from './assistant.mapping';
import {
  DistillationResult,
  distillationResultSchema,
  PREFERENCE_DISTILLATION_PROMPT,
} from './preference-distillation.contracts';

export interface DistillParams {
  userId: string;
  /** Correlates the distillation pass with the action point that triggered it. */
  runId: string;
  /** The conversation staging buffer, in capture order. */
  candidates: PendingCandidate[];
  /** Discipline used to stamp items whose own discipline is null. */
  discipline: EventDiscipline;
  /** Today's local date (YYYY-MM-DD) for stamping the emitted events. */
  today: string;
}

/**
 * The net-intent distillation pass (Phase 2 of the dual-mode redesign). DISTINCT
 * from `personalization`'s `DistillationService`, which rebuilds the
 * `user_preferences` projection by replaying the durable log. THIS service runs
 * a bounded LLM call over the conversation staging buffer at an action point and
 * collapses the iteration history to net intent, returning the source-agnostic
 * preference items the ingestion path writes with `source='chat'`.
 *
 * Durability guarantee: if the LLM pass fails or returns nothing usable, we fall
 * back to writing the raw staged candidates as-is rather than silently dropping
 * captured intent.
 */
@Injectable()
export class PreferenceDistillationService {
  private readonly logger = new Logger(PreferenceDistillationService.name);

  constructor(private readonly loop: AgenticLoopRuntime) {}

  async distill(params: DistillParams): Promise<PreferenceItemDto[]> {
    const { candidates } = params;
    if (candidates.length === 0) {
      return [];
    }

    let result: DistillationResult | null = null;
    try {
      const loopRes = await this.loop.run<DistillationResult>({
        agentName: 'preference-distillation',
        systemPrompt: PREFERENCE_DISTILLATION_PROMPT,
        seedMessage: this.renderSeed(candidates),
        tools: [this.netIntentTool()],
        ctx: { userId: params.userId, runId: params.runId },
        temperature: 0,
        coerceTerminalTool: true,
      });
      result = loopRes.terminalResult;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Distillation failed (${reason}); writing raw buffer.`);
    }

    // No usable net-intent result → preserve intent by writing the raw buffer.
    if (!result) {
      return candidates.map((c) =>
        signalToPreferenceItem(
          candidateToSignal(c),
          params.today,
          confidenceForLane(c.lane),
        ),
      );
    }

    return result.signals.map((s) =>
      signalToPreferenceItem(
        { ...s, discipline: s.discipline ?? params.discipline },
        params.today,
        confidenceForLane(s.lane),
      ),
    );
  }

  /** Render the ordered staging buffer as the distillation seed. */
  private renderSeed(candidates: PendingCandidate[]): string {
    const lines = candidates.map((c, i) => {
      const target = c.target
        ? ` target=${JSON.stringify(c.target)}`
        : '';
      const raw = c.rawText ? ` raw="${c.rawText}"` : '';
      return `${i + 1}. [${c.lane}] ${c.tagType} value=${JSON.stringify(
        c.value,
      )} polarity=${c.polarity} scope=${c.scope} discipline=${
        c.discipline ?? 'any'
      } durability=${c.durability}${target}${raw}`;
    });
    return [
      '== STAGED PREFERENCE CANDIDATES (capture order) ==',
      ...lines,
      '',
      'Collapse these to net intent and call net_intent once.',
    ].join('\n');
  }

  private netIntentTool(): AnyAgentTool {
    return defineTool<DistillationResult, DistillationResult>({
      name: 'net_intent',
      description:
        'Declare the net-intent preference signals after collapsing the staged candidates. Terminal: ends the pass.',
      schema: distillationResultSchema,
      terminal: true,
      handler: (args) => Promise.resolve(args),
    });
  }
}

/** Widen a neutral buffer candidate back to a captured signal for mapping. */
function candidateToSignal(c: PendingCandidate): CapturedSignal {
  return {
    tagType: c.tagType as CapturedSignal['tagType'],
    value: c.value,
    polarity: c.polarity,
    durability: c.durability,
    scope: c.scope,
    discipline: c.discipline,
    affectsCurrentWeek: c.affectsCurrentWeek,
    target: c.target
      ? {
          plannedSessionId: c.target.plannedSessionId,
          exerciseId: c.target.exerciseId,
          runType: (c.target.runType as RunType | null) ?? null,
        }
      : null,
    rawText: c.rawText,
  };
}
