import { classifyOutcome } from '../outcome.policy';

describe('outcome.policy', () => {
  it('routes injury/illness to immediate safety regardless of status', () => {
    expect(classifyOutcome('completed', 'injury_or_illness')).toBe(
      'immediate_safety',
    );
    expect(classifyOutcome('skipped', 'injury_or_illness')).toBe(
      'immediate_safety',
    );
  });

  it('asks for clarification on a negative status', () => {
    expect(classifyOutcome('skipped', null)).toBe('ask_clarifying');
    expect(classifyOutcome('deviated', null)).toBe('ask_clarifying');
    expect(classifyOutcome('partially_completed', null)).toBe('ask_clarifying');
  });

  it('asks for clarification on a negative reason even when completed', () => {
    expect(classifyOutcome('completed', 'too_hard')).toBe('ask_clarifying');
    expect(classifyOutcome('completed', 'no_motivation')).toBe('ask_clarifying');
    expect(classifyOutcome('completed', 'disliked_exercise')).toBe(
      'ask_clarifying',
    );
  });

  it('does nothing for a clean positive completion', () => {
    expect(classifyOutcome('completed', null)).toBe('none');
  });

  it('does nothing for a benign reason on a completed session', () => {
    expect(classifyOutcome('completed', 'weather')).toBe('none');
    expect(classifyOutcome('completed', 'travel')).toBe('none');
  });
});
