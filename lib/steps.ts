// Steps and milestones live in the Notion Todos text, one item per line.
//
// The planner bot writes that field too, so every edit here touches only the
// line it targets. Separators and all other lines survive byte for byte, which
// is why parsing keeps the separators instead of normalising them.

// The site used to join lines with "<br />"; the bot uses newlines.
const LINE_SEPARATOR = /(\r?\n|<br\s*\/?>)/i;
const MILESTONE = /^##\s+(.+)$/;
const CHECKBOX = /^(?:\\?[-*•]\s+)?(?:\[([ xX])\]|(✓))\s*(.*)$/;
const BULLET = /^\\?[-*•]\s+(.*)$/;
const DUE_SUFFIX = /\s*\(due\s+([^()]+)\)$/i;
// Owners can be multi-word ("@Velox Dev Bot"). Requiring whitespace before the
// @ keeps email addresses from being read as owners.
const OWNER_SUFFIX = /(?:^|\s)@([A-Za-z0-9._-]+(?: [A-Z][A-Za-z0-9._-]*)*)$/;

export interface StepLine {
  /** Position among all lines of the text, including blank ones. */
  index: number;
  raw: string;
  kind: 'step' | 'milestone';
  /** Editable content: the line without its marker, metadata included. */
  body: string;
  /** Display text: body without trailing @owner / (due ...). */
  text: string;
  completed: boolean;
  owner?: string;
  due?: string;
  milestone: string | null;
}

export interface LineRef {
  index: number;
  raw: string;
}

export type StepOp =
  | { type: 'toggle'; line: LineRef; completed: boolean }
  | { type: 'edit'; line: LineRef; text: string }
  | { type: 'remove'; line: LineRef }
  | { type: 'addStep'; text: string; milestone: string | null }
  | { type: 'addMilestone'; name: string };

/** The text changed underneath the edit, so applying it could hit the wrong line. */
export class StepConflictError extends Error {}

function metadataFrom(body: string): Pick<StepLine, 'text' | 'owner' | 'due'> {
  let text = body.trim();
  let owner: string | undefined;
  let due: string | undefined;
  // Either order is valid, so strip up to one of each.
  for (let pass = 0; pass < 2; pass++) {
    const dueMatch = due === undefined ? DUE_SUFFIX.exec(text) : null;
    if (dueMatch) {
      due = dueMatch[1].trim();
      text = text.slice(0, dueMatch.index).trimEnd();
      continue;
    }
    const ownerMatch = owner === undefined ? OWNER_SUFFIX.exec(text) : null;
    if (ownerMatch) {
      owner = ownerMatch[1];
      text = text.slice(0, ownerMatch.index).trimEnd();
      continue;
    }
    break;
  }
  return { text, owner, due };
}

function classify(raw: string, index: number, milestone: string | null): StepLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const heading = MILESTONE.exec(trimmed);
  if (heading) {
    const name = heading[1].trim();
    return { index, raw, kind: 'milestone', body: name, text: name, completed: false, milestone: name };
  }

  const checkbox = CHECKBOX.exec(trimmed);
  const bullet = checkbox ? null : BULLET.exec(trimmed);
  const body = (checkbox ? checkbox[3] : bullet ? bullet[1] : trimmed).trim();
  if (!body) return null;
  const completed = checkbox ? checkbox[2] === '✓' || /x/i.test(checkbox[1] ?? '') : false;
  return { index, raw, kind: 'step', body, completed, milestone, ...metadataFrom(body) };
}

function toParts(raw: string): string[] {
  return raw ? raw.split(LINE_SEPARATOR) : [];
}

export function parseSteps(raw: string): StepLine[] {
  const parts = toParts(raw);
  const lines: StepLine[] = [];
  let milestone: string | null = null;
  for (let part = 0; part < parts.length; part += 2) {
    const line = classify(parts[part], part / 2, milestone);
    if (!line) continue;
    if (line.kind === 'milestone') milestone = line.milestone;
    lines.push(line);
  }
  return lines;
}

export interface StepGroup {
  milestone: string | null;
  heading?: StepLine;
  steps: StepLine[];
}

export function groupSteps(lines: StepLine[]): StepGroup[] {
  const groups: StepGroup[] = [];
  for (const line of lines) {
    if (line.kind === 'milestone') {
      groups.push({ milestone: line.body, heading: line, steps: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ milestone: null, steps: [] });
    groups[groups.length - 1].steps.push(line);
  }
  return groups;
}

export function stepProgress(raw: string | null | undefined) {
  const steps = parseSteps(raw || '').filter((line) => line.kind === 'step');
  const done = steps.filter((step) => step.completed).length;
  return { done, total: steps.length, next: steps.find((step) => !step.completed)?.text };
}

// A single step must stay on one line, or it would become several.
function oneLine(text: string): string {
  return text.replace(/\s*(?:\r?\n|<br\s*\/?>)\s*/gi, ' ').trim();
}

function render(line: StepLine, completed: boolean, body: string): string {
  const lead = /^\s*/.exec(line.raw)?.[0] ?? '';
  return line.kind === 'milestone'
    ? `${lead}## ${body}`
    : `${lead}- [${completed ? 'x' : ' '}] ${body}`;
}

function locate(lines: StepLine[], ref: LineRef): StepLine {
  const exact = lines.find((line) => line.index === ref.index && line.raw === ref.raw);
  if (exact) return exact;
  // The bot may have inserted lines above; a unique text match is still safe.
  const moved = lines.filter((line) => line.raw === ref.raw);
  if (moved.length === 1) return moved[0];
  throw new StepConflictError('That step changed elsewhere. Reload and try again.');
}

function insertAfter(parts: string[], lineIndex: number, text: string): void {
  parts.splice(lineIndex * 2 + 1, 0, '\n', text);
}

export function applyStepOp(raw: string, op: StepOp): string {
  const parts = toParts(raw);
  const lines = parseSteps(raw);

  switch (op.type) {
    case 'toggle': {
      const line = locate(lines, op.line);
      if (line.kind !== 'step') throw new StepConflictError('Only steps can be ticked.');
      parts[line.index * 2] = render(line, op.completed, line.body);
      break;
    }
    case 'edit': {
      const line = locate(lines, op.line);
      const body = oneLine(op.text);
      if (!body) throw new StepConflictError('A step needs some text.');
      parts[line.index * 2] = render(line, line.completed, body);
      break;
    }
    case 'remove': {
      const line = locate(lines, op.line);
      const at = line.index * 2;
      if (at + 1 < parts.length) parts.splice(at, 2);
      else parts.splice(Math.max(at - 1, 0), at === 0 ? 1 : 2);
      break;
    }
    case 'addStep': {
      const newLine = `- [ ] ${oneLine(op.text)}`;
      if (!oneLine(op.text)) throw new StepConflictError('A step needs some text.');
      if (parts.length === 0) return newLine;
      const group = groupSteps(lines).find((candidate) => candidate.milestone === op.milestone);
      if (group) {
        const last = group.steps[group.steps.length - 1] ?? group.heading;
        insertAfter(parts, last!.index, newLine);
      } else if (op.milestone !== null) {
        throw new StepConflictError(`Milestone "${op.milestone}" no longer exists.`);
      } else if (lines.length > 0) {
        // No loose steps yet: they belong above the first milestone heading.
        parts.splice(lines[0].index * 2, 0, newLine, '\n');
      } else {
        parts.splice(0, parts.length, newLine);
      }
      break;
    }
    case 'addMilestone': {
      const name = oneLine(op.name);
      if (!name) throw new StepConflictError('A milestone needs a name.');
      const heading = `## ${name}`;
      if (lines.length === 0) return heading;
      insertAfter(parts, lines[lines.length - 1].index, heading);
      break;
    }
  }
  return parts.join('');
}
