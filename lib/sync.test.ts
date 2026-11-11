import { describe, expect, it } from 'vitest';
import { mergeIncoming } from './sync';
import type { Task } from './types';

const row = (id: string, edited: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  dateCreated: '2026-01-01',
  status: 'To Do',
  lastEditedTime: edited,
  ...extra,
});
const guards = { busyIds: new Set<string>(), settledIds: new Set<string>(), editingId: null, openId: null };

describe('mergeIncoming', () => {
  it('keeps object identity for unchanged rows', () => {
    const local = [row('a', '1')];
    expect(mergeIncoming(local, [row('a', '1')], guards).tasks[0]).toBe(local[0]);
  });

  it('takes changed rows and new rows', () => {
    const { tasks } = mergeIncoming([row('a', '1')], [row('a', '2', { title: 'new' }), row('b', '1')], guards);
    expect(tasks.map((t) => t.title)).toEqual(['new', 'b']);
  });

  it('never overwrites a row with a write in flight', () => {
    const local = [row('a', '1', { title: 'mine' }), row('b', '1', { title: 'pending', pendingSync: true })];
    const { tasks } = mergeIncoming(local, [row('a', '2'), row('b', '2')], {
      ...guards,
      busyIds: new Set(['a']),
    });
    expect(tasks.map((t) => t.title)).toEqual(['mine', 'pending']);
  });

  it('holds a change to the row being edited instead of applying it', () => {
    const incoming = row('a', '2', { title: 'bot' });
    const { tasks, held } = mergeIncoming([row('a', '1', { title: 'typing' })], [incoming], {
      ...guards,
      editingId: 'a',
      openId: 'a',
    });
    expect(tasks[0].title).toBe('typing');
    expect(held.a).toBe(incoming);
  });

  it('does not let a response older than a confirmed save undo it', () => {
    const local = [row('a', '5', { title: 'saved' })];
    const incoming = [row('a', '4', { title: 'old' })];
    expect(mergeIncoming(local, incoming, guards).tasks[0].title).toBe('saved');
    const sameMinute = [row('a', '5', { title: 'old' })];
    expect(mergeIncoming(local, sameMinute, { ...guards, settledIds: new Set(['a']) }).tasks[0].title).toBe('saved');
  });

  it('picks up an edit that shares the last timestamp', () => {
    const { tasks } = mergeIncoming([row('a', '5')], [row('a', '5', { title: 'bot' })], guards);
    expect(tasks[0].title).toBe('bot');
  });

  it('keeps a just-created row a slower list response does not know about', () => {
    const { tasks } = mergeIncoming([row('new', '1')], [], { ...guards, settledIds: new Set(['new']) });
    expect(tasks.map((t) => t.id)).toEqual(['new']);
  });

  it('keeps drafts and the open row when Notion omits them', () => {
    const { tasks } = mergeIncoming([row('temp-1', '1'), row('open', '1'), row('gone', '1')], [], {
      ...guards,
      openId: 'open',
    });
    expect(tasks.map((t) => t.id)).toEqual(['temp-1', 'open']);
  });
});
