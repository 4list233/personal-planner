import { describe, expect, it } from 'vitest';
import { cleanPeople, parseStepOp, parseTaskPatch } from './task-patch';

describe('parseTaskPatch', () => {
  it('accepts a normal edit', () => {
    expect(parseTaskPatch({ title: 'x', priority: null, plannedDay: '2026-11-09' })).toEqual({
      ok: true,
      value: { title: 'x', priority: null, plannedDay: '2026-11-09' },
    });
  });

  it('cannot reach page-level trash flags or unknown fields', () => {
    expect(parseTaskPatch({ archived: true }).ok).toBe(false);
    expect(parseTaskPatch({ in_trash: true }).ok).toBe(false);
    expect(parseTaskPatch({ todosText: 'overwrite' }).ok).toBe(false);
    expect(parseTaskPatch({ todoItems: [] }).ok).toBe(false);
  });

  it('rejects values Notion does not have', () => {
    expect(parseTaskPatch({ priority: 'P0' }).ok).toBe(false);
    expect(parseTaskPatch({ status: 'Someday' }).ok).toBe(false);
    expect(parseTaskPatch({ title: '  ' }).ok).toBe(false);
    expect(parseTaskPatch({ dueDate: 'soon' }).ok).toBe(false);
  });

  it('always finishes both Stage and Status together', () => {
    expect(parseTaskPatch({ status: 'Done' })).toEqual({ ok: true, value: { status: 'Done', stage: 'Done' } });
    expect(parseTaskPatch({ stage: 'Done' })).toEqual({ ok: true, value: { stage: 'Done', status: 'Done' } });
    expect(parseTaskPatch({ status: 'Done', stage: 'Today' }).ok).toBe(false);
    expect(parseTaskPatch({ stage: 'Done', status: 'To Do' }).ok).toBe(false);
  });

  it('keeps Archive a separate action', () => {
    expect(parseTaskPatch({ status: 'Archived' }).ok).toBe(true);
    expect(parseTaskPatch({ status: 'Archived', stage: 'Done' }).ok).toBe(false);
  });
});

describe('parseStepOp', () => {
  it('accepts each operation and rejects anything else', () => {
    expect(parseStepOp({ type: 'toggle', line: { index: 0, raw: '- a' }, completed: true }).ok).toBe(true);
    expect(parseStepOp({ type: 'addStep', text: 'a', milestone: null }).ok).toBe(true);
    expect(parseStepOp({ type: 'addMilestone', name: 'M' }).ok).toBe(true);
    expect(parseStepOp({ type: 'replaceAll', text: '' }).ok).toBe(false);
    expect(parseStepOp({ type: 'toggle', line: { index: -1, raw: '' }, completed: true }).ok).toBe(false);
  });
});

describe('people', () => {
  it('accepts names, trims them and drops duplicates', () => {
    expect(parseTaskPatch({ people: [' Noa ', 'Sam', 'Noa'] })).toEqual({ ok: true, value: { people: ['Noa', 'Sam'] } });
    expect(parseTaskPatch({ people: [] })).toEqual({ ok: true, value: { people: [] } });
  });

  it('rejects names Notion cannot store', () => {
    expect(parseTaskPatch({ people: ['Noa, Sam'] }).ok).toBe(false);
    expect(parseTaskPatch({ people: [''] }).ok).toBe(false);
    expect(parseTaskPatch({ people: 'Noa' }).ok).toBe(false);
  });

  it('cleans names on create', () => {
    expect(cleanPeople([' Noa', 'Noa', 'a,b', 5, ''])).toEqual(['Noa']);
  });
});
