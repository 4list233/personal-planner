import type { GeminiBacklogPayload, GeminiBacklogResponse } from './auto-plan';
import { Weekday } from './types';

const VALID_DAYS: Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Build the Gemini prompt body. Kept short, JSON-strict, and deterministic.
 * Used by both the API route and any future test fixture.
 */
export function buildBacklogPrompt(payload: GeminiBacklogPayload): string {
  const lines: string[] = [
    'You are a scheduling assistant. Distribute the BACKLOG tasks below across the available weekdays so daily loads stay manageable. Never exceed maxPerDay tasks on any day. Front-load lighter days to balance the week.',
    '',
    'Strict output: JSON only, no markdown, no commentary. Schema:',
    '{',
    '  "assignments": [{ "taskId": "<id>", "day": "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" }],',
    '  "overflow": ["<taskId>", ...],',
    '  "reasoning": "<one short sentence on the load distribution choice>"',
    '}',
    '',
    'Inputs:',
    `- today: ${payload.today} (${payload.todayDayName})`,
    `- availableDays: ${payload.availableDays.join(', ')}`,
    `- maxPerDay: ${payload.maxPerDay}`,
    `- currentLoad (already-placed tasks): ${JSON.stringify(payload.currentLoad)}`,
    `- backlogTasks: ${JSON.stringify(payload.backlogTasks)}`,
    '',
    'Rules:',
    '1. Place every task if total fits within capacity. If not, fill from least-loaded days first and put the rest in "overflow".',
    '2. Tasks with longer / more complex titles count as "heavier" — try to spread them across days rather than stacking three on one day.',
    '3. Prefer earlier days for tasks whose title implies time-sensitivity (e.g. "by", "deadline", "review before").',
    '4. Output JSON only.',
  ];
  return lines.join('\n');
}

const SHORT_TO_LONG: Record<string, Weekday> = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

function normalizeDay(s: unknown): Weekday | null {
  if (typeof s !== 'string') return null;
  if (VALID_DAYS.includes(s as Weekday)) return s as Weekday;
  return SHORT_TO_LONG[s] ?? null;
}

/**
 * Strip ``` fences and parse the model's JSON. Forgiving — returns null on
 * any malformed input so the caller can fall back to deterministic placement.
 */
export function parseBacklogResponse(text: string): GeminiBacklogResponse | null {
  if (!text) return null;
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) body = fence[1];
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawAssignments = Array.isArray(obj.assignments) ? obj.assignments : [];
  const assignments: { taskId: string; day: Weekday }[] = [];
  for (const a of rawAssignments) {
    if (!a || typeof a !== 'object') continue;
    const rec = a as Record<string, unknown>;
    const taskId = typeof rec.taskId === 'string' ? rec.taskId : null;
    const day = normalizeDay(rec.day);
    if (taskId && day) assignments.push({ taskId, day });
  }
  const overflow = Array.isArray(obj.overflow)
    ? obj.overflow.filter((x): x is string => typeof x === 'string')
    : [];
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : undefined;
  return { assignments, overflow, reasoning };
}

/**
 * Browser-side caller. POSTs the payload to the server route which holds
 * the Gemini API key, then parses the JSON response. Throws on network
 * failure so the auto-plan algorithm can fall back to round-robin.
 */
export async function callBacklogGemini(
  payload: GeminiBacklogPayload,
  fetchHeaders: HeadersInit
): Promise<GeminiBacklogResponse> {
  const res = await fetch('/api/auto-plan/gemini', {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Gemini route failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Malformed Gemini response');
  }
  // Server already parses; defensively validate again.
  const validated = parseBacklogResponse(JSON.stringify(data));
  if (!validated) throw new Error('Unparseable Gemini response');
  return validated;
}
