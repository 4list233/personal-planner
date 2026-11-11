// The only shapes the write routes accept. Field lists are explicit so a
// request can never reach Notion's page-level `archived` or `in_trash` flags.
import { z } from 'zod';
import type { StepOp } from './steps';
import type { Task } from './types';

const STATUSES = [
  'Reminders',
  'Long Term Deadlines',
  'To Do',
  'Doing Today',
  'Doing Tomorrow',
  'Archived',
  'Done',
  'Blocked',
] as const;
const STAGES = ['Inbox', 'This Week', 'Today', 'In Progress', 'Waiting', 'Done'] as const;
const PRIORITIES = ['P1', 'P2', 'P3'] as const;
const PROJECTS = ['Velox', 'School', 'Personal', 'Leads', 'Other'] as const;
const BUCKETS = ['Mine', 'Dispatch', 'Follow-up', 'Watch', 'Long-term'] as const;

// Notion multi-select option names can't contain commas, and 100 characters is
// Notion's limit on an option name.
const person = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((name) => !name.includes(','), 'A name cannot contain a comma');

/** Valid, unique names from a create request; anything that isn't a valid name is dropped. */
export function cleanPeople(values: unknown[]): string[] {
  const names = values.flatMap((value) => {
    const parsed = person.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return [...new Set(names)].slice(0, 20);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Expected a YYYY-MM-DD date').nullable();

const patchSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(2000),
    dueDate: day,
    plannedDay: day,
    status: z.enum(STATUSES),
    stage: z.enum(STAGES).nullable(),
    priority: z.enum(PRIORITIES).nullable(),
    project: z.enum(PROJECTS).nullable(),
    bucket: z.enum(BUCKETS).nullable(),
    nextAction: z.string().nullable(),
    sourceText: z.string().nullable(),
    waitingOn: z.string().nullable(),
    // 20 is far more people than one task needs, and keeps a request small.
    people: z.array(person).max(20).transform((names) => [...new Set(names)]),
    commentsText: z.string(),
    important: z.boolean(),
    urgent: z.boolean(),
  })
  .partial();

export type TaskPatch = Partial<Task>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request';
}

export function parseTaskPatch(body: unknown): Parsed<TaskPatch> {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const patch: TaskPatch = { ...parsed.data } as TaskPatch;

  // Stage and Status must agree on Done, or a task ends up half finished.
  const stageSent = 'stage' in patch;
  if (patch.status === 'Done' && stageSent && patch.stage !== 'Done') {
    return { ok: false, error: 'Status Done requires Stage Done' };
  }
  if (patch.stage === 'Done' && patch.status !== undefined && patch.status !== 'Done') {
    return { ok: false, error: 'Stage Done requires Status Done' };
  }
  if (patch.status === 'Done') patch.stage = 'Done';
  if (patch.stage === 'Done') patch.status = 'Done';

  // Archiving is its own action on a finished task; nothing else rides along.
  if (patch.status === 'Archived' && Object.keys(patch).length > 1) {
    return { ok: false, error: 'Archive cannot be combined with other changes' };
  }
  return { ok: true, value: patch };
}

const lineRef = z.strictObject({ index: z.number().int().min(0), raw: z.string() });

const stepOpSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('toggle'), line: lineRef, completed: z.boolean() }),
  z.strictObject({ type: z.literal('edit'), line: lineRef, text: z.string().min(1) }),
  z.strictObject({ type: z.literal('remove'), line: lineRef }),
  z.strictObject({ type: z.literal('addStep'), text: z.string().min(1), milestone: z.string().nullable() }),
  z.strictObject({ type: z.literal('addMilestone'), name: z.string().min(1) }),
]);

export function parseStepOp(body: unknown): Parsed<StepOp> {
  const parsed = stepOpSchema.safeParse(body);
  return parsed.success
    ? { ok: true, value: parsed.data as StepOp }
    : { ok: false, error: firstIssue(parsed.error) };
}
