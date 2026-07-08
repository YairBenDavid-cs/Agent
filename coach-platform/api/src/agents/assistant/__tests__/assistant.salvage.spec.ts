import {
  salvageAssistantTurn,
  stripStructuredArtifacts,
} from '../assistant.salvage';

describe('salvageAssistantTurn', () => {
  it('recovers a turn emulated as a fenced ```json block in prose', () => {
    const text = [
      'Hello! How can I assist you today?',
      '',
      'I\'ll be here to help!',
      '',
      '```json',
      JSON.stringify({ lane: 'white', reply: 'Hello! How can I assist you today?' }),
      '```',
    ].join('\n');

    const turn = salvageAssistantTurn(text);
    expect(turn).not.toBeNull();
    expect(turn?.lane).toBe('white');
    expect(turn?.reply).toBe('Hello! How can I assist you today?');
    // Schema defaults are applied to the salvaged turn.
    expect(turn?.captured).toEqual([]);
    expect(turn?.clarifyingQuestion).toBeNull();
  });

  it('recovers a bare JSON object with no code fence', () => {
    const text =
      'Sure thing. {"lane":"black","reply":"Got it — capping runs at 25 km."}';
    const turn = salvageAssistantTurn(text);
    expect(turn?.lane).toBe('black');
    expect(turn?.reply).toBe('Got it — capping runs at 25 km.');
  });

  it('recovers captured signals embedded in the JSON', () => {
    const text =
      '```json\n' +
      JSON.stringify({
        lane: 'black',
        reply: 'Dropping Friday.',
        captured: [
          {
            tagType: 'time_window_blocked',
            value: 'friday',
            polarity: 'avoid',
            durability: 'standing',
            scope: 'global',
            discipline: 'running',
            affectsCurrentWeek: true,
            rationale: 'Friday conflicts with a recurring work commitment.',
          },
        ],
      }) +
      '\n```';

    const turn = salvageAssistantTurn(text);
    expect(turn?.captured).toHaveLength(1);
    expect(turn?.captured[0].tagType).toBe('time_window_blocked');
  });

  it('returns null for plain prose with no JSON', () => {
    expect(salvageAssistantTurn('Just a normal answer, nothing structured.')).toBeNull();
  });

  it('returns null when the JSON does not match the schema', () => {
    expect(salvageAssistantTurn('```json\n{"foo":"bar"}\n```')).toBeNull();
  });

  it('returns null for null/empty input', () => {
    expect(salvageAssistantTurn(null)).toBeNull();
    expect(salvageAssistantTurn('')).toBeNull();
  });
});

describe('stripStructuredArtifacts', () => {
  it('removes a fenced JSON block and keeps the prose', () => {
    const text = 'Here is your answer.\n\n```json\n{"lane":"white"}\n```';
    expect(stripStructuredArtifacts(text)).toBe('Here is your answer.');
  });

  it('blanks output that is nothing but a bare JSON object', () => {
    expect(stripStructuredArtifacts('{"lane":"white","reply":"hi"}')).toBe('');
  });

  it('returns plain prose unchanged', () => {
    expect(stripStructuredArtifacts('A perfectly normal reply.')).toBe(
      'A perfectly normal reply.',
    );
  });

  it('returns empty string for null/empty input', () => {
    expect(stripStructuredArtifacts(null)).toBe('');
    expect(stripStructuredArtifacts('')).toBe('');
  });
});
