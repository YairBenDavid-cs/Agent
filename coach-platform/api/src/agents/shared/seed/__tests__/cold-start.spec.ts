import { detectColdStart } from '../cold-start';

describe('detectColdStart', () => {
  it('is cold when there is no program, no sessions and no performance', () => {
    expect(
      detectColdStart({
        hasProgram: false,
        observedSessionCount: 0,
        performanceCount: 0,
      }),
    ).toBe(true);
  });

  it('is warm once a program exists', () => {
    expect(
      detectColdStart({
        hasProgram: true,
        observedSessionCount: 0,
        performanceCount: 0,
      }),
    ).toBe(false);
  });

  it('is warm once any observed session exists', () => {
    expect(
      detectColdStart({
        hasProgram: false,
        observedSessionCount: 3,
        performanceCount: 0,
      }),
    ).toBe(false);
  });

  it('is warm once any performance aggregate exists', () => {
    expect(
      detectColdStart({
        hasProgram: false,
        observedSessionCount: 0,
        performanceCount: 1,
      }),
    ).toBe(false);
  });
});
