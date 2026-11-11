import { describe, expect, it } from 'vitest';
import { applyStepOp, groupSteps, parseSteps, StepConflictError, stepProgress } from './steps';

const OUTREACH = [
  '## Page setup',
  '- [x] Audit current outreach page layout',
  '- [ ] Wire page setup to integration @Phinn',
  '## Sending flow',
  '- [ ] Fix sequence step ordering',
  '- [ ] QA with persona test (due Nov 12)',
].join('\n');

const ref = (raw: string, line: number) => {
  const found = parseSteps(raw).find((item) => item.index === line)!;
  return { index: found.index, raw: found.raw };
};

describe('parseSteps', () => {
  it('reads the milestone example from the spec', () => {
    const groups = groupSteps(parseSteps(OUTREACH));
    expect(groups.map((group) => group.milestone)).toEqual(['Page setup', 'Sending flow']);
    expect(groups[0].steps.map((step) => step.completed)).toEqual([true, false]);
    expect(groups[0].steps[1]).toMatchObject({ text: 'Wire page setup to integration', owner: 'Phinn' });
    expect(groups[1].steps[1]).toMatchObject({ text: 'QA with persona test', due: 'Nov 12' });
  });

  it('treats the formats already in Notion as open or done', () => {
    const lines = parseSteps('- bot bullet\nplain line\n✓ old done\n[x] bare done\n\\- escaped<br />- [ ] after br');
    expect(lines.map((line) => [line.text, line.completed])).toEqual([
      ['bot bullet', false],
      ['plain line', false],
      ['old done', true],
      ['bare done', true],
      ['escaped', false],
      ['after br', false],
    ]);
  });

  it('reads multi-word owners, either metadata order, and leaves emails alone', () => {
    expect(parseSteps('- [ ] Ship (due Nov 2) @Velox Dev Bot')[0]).toMatchObject({
      text: 'Ship',
      owner: 'Velox Dev Bot',
      due: 'Nov 2',
    });
    expect(parseSteps('- Email amy@example.com')[0]).toMatchObject({
      text: 'Email amy@example.com',
      owner: undefined,
    });
  });
});

describe('stepProgress', () => {
  it('counts steps, not headings, and finds the next open one', () => {
    expect(stepProgress(OUTREACH)).toEqual({
      done: 1,
      total: 4,
      next: 'Wire page setup to integration',
    });
    expect(stepProgress(undefined)).toEqual({ done: 0, total: 0, next: undefined });
  });
});

describe('applyStepOp', () => {
  it('rewrites only the ticked line and keeps every other byte', () => {
    const raw = '- first  \r\n\n  plain step<br />  - third\n## M\n✓ fourth\n';
    const next = applyStepOp(raw, { type: 'toggle', line: ref(raw, 3), completed: true });
    expect(next).toBe('- first  \r\n\n  plain step<br />  - [x] third\n## M\n✓ fourth\n');
  });

  it('turns a done line back to open', () => {
    expect(applyStepOp('✓ a\n- b', { type: 'toggle', line: { index: 0, raw: '✓ a' }, completed: false })).toBe(
      '- [ ] a\n- b'
    );
  });

  it('finds a line the bot moved', () => {
    const next = applyStepOp('- new from bot\n- mine', {
      type: 'toggle',
      line: { index: 0, raw: '- mine' },
      completed: true,
    });
    expect(next).toBe('- new from bot\n- [x] mine');
  });

  it('refuses when the target is gone or ambiguous', () => {
    expect(() =>
      applyStepOp('- other', { type: 'toggle', line: { index: 0, raw: '- gone' }, completed: true })
    ).toThrow(StepConflictError);
    expect(() =>
      applyStepOp('- same\n- x\n- same', { type: 'remove', line: { index: 5, raw: '- same' } })
    ).toThrow(StepConflictError);
  });

  it('edits text, keeps state, and cannot smuggle in a new line', () => {
    const next = applyStepOp('- [x] a\n- b', {
      type: 'edit',
      line: { index: 0, raw: '- [x] a' },
      text: 'one\ntwo',
    });
    expect(next).toBe('- [x] one two\n- b');
  });

  it('removes a line and its separator', () => {
    expect(applyStepOp('- a\n- b\n- c', { type: 'remove', line: { index: 1, raw: '- b' } })).toBe('- a\n- c');
    expect(applyStepOp('- a\n- b', { type: 'remove', line: { index: 1, raw: '- b' } })).toBe('- a');
    expect(applyStepOp('- a', { type: 'remove', line: { index: 0, raw: '- a' } })).toBe('');
  });

  it('adds a step at the end of its milestone', () => {
    const next = applyStepOp('## A\n- [ ] a1\n## B\n- [ ] b1', {
      type: 'addStep',
      text: 'a2',
      milestone: 'A',
    });
    expect(next).toBe('## A\n- [ ] a1\n- [ ] a2\n## B\n- [ ] b1');
  });

  it('adds loose steps above the first milestone', () => {
    expect(applyStepOp('## A\n- a1', { type: 'addStep', text: 'x', milestone: null })).toBe('- [ ] x\n## A\n- a1');
    expect(applyStepOp('- a\n## A', { type: 'addStep', text: 'x', milestone: null })).toBe('- a\n- [ ] x\n## A');
    expect(applyStepOp('', { type: 'addStep', text: 'x', milestone: null })).toBe('- [ ] x');
  });

  it('adds a milestone at the end', () => {
    expect(applyStepOp('- a', { type: 'addMilestone', name: 'Ship' })).toBe('- a\n## Ship');
    expect(applyStepOp('', { type: 'addMilestone', name: 'Ship' })).toBe('## Ship');
  });
});
