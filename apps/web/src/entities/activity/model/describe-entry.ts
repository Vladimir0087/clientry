import { formatMoney } from '@/shared/lib/money';
import type { ActivityEntry } from '@clientry/shared/activity';
import type { DealChange } from '@clientry/shared/deals';

// The subject is a link or plain text, the due time renders in the reader's zone, and an outcome
// is a badge, so a sentence is a list of parts rather than a string.
export type EntryPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'subject' }
  | { readonly kind: 'due'; readonly at: string }
  | { readonly kind: 'outcome'; readonly outcome: 'won' | 'lost' };

export type EntryLine = readonly EntryPart[];

const SUBJECT: EntryPart = { kind: 'subject' };

function text(value: string): EntryPart {
  return { kind: 'text', text: value };
}

function sentence(before: string, after = ''): EntryLine {
  return after === '' ? [text(before), SUBJECT] : [text(before), SUBJECT, text(after)];
}

function describeChange(actor: string, change: DealChange): EntryLine {
  switch (change.field) {
    case 'title':
      return sentence(`${actor} renamed `, ` from “${change.from}” to “${change.to}”`);
    case 'amount': {
      const from = formatMoney(change.from.amount, change.from.currency);
      const to = formatMoney(change.to.amount, change.to.currency);
      return sentence(`${actor} changed the amount of `, ` from ${from} to ${to}`);
    }
    case 'client':
      return sentence(
        `${actor} changed the client of `,
        ` from ${change.from.name} to ${change.to.name}`,
      );
    case 'assignee':
      return sentence(
        `${actor} changed the assignee of `,
        ` from ${change.from.name} to ${change.to.name}`,
      );
  }
}

// One line per sentence; a deal edit gets a line for each field it changed. Names other than the
// actor's and the subject's are the snapshots of the payload.
export function describeEntry(entry: ActivityEntry): readonly EntryLine[] {
  const actor = entry.actor.name;
  switch (entry.type) {
    case 'deal_created': {
      const { stage, amount, currency } = entry.payload;
      return [
        sentence(
          `${actor} created the deal `,
          ` in ${stage.name} · ${formatMoney(amount, currency)}`,
        ),
      ];
    }
    case 'deal_moved': {
      const { from, to, reason } = entry.payload;
      const cause = reason === 'stage_deleted' ? ` when ${from.name} was deleted` : '';
      const line = sentence(`${actor} moved `, ` from ${from.name} to ${to.name}${cause}`);
      return [to.kind === 'open' ? line : [...line, { kind: 'outcome', outcome: to.kind }]];
    }
    case 'deal_updated':
      return entry.payload.changes.map((change) => describeChange(actor, change));
    case 'deal_deleted':
      return [sentence(`${actor} deleted the deal `)];
    case 'deal_restored':
      return [sentence(`${actor} restored the deal `)];
    case 'client_created':
      return [sentence(`${actor} added the client `)];
    case 'task_created': {
      const { assignee, dueAt } = entry.payload;
      const forWhom = assignee.id === entry.actor.id ? '' : ` for ${assignee.name}`;
      return [
        [
          ...sentence(`${actor} created the task `, `${forWhom} · due `),
          { kind: 'due', at: dueAt },
        ],
      ];
    }
    case 'task_completed':
      return [sentence(`${actor} completed the task `)];
  }
}
