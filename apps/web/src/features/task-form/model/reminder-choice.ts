import type { SelectOption } from '@/shared/ui/option-select';

const MINUTE_MS = 60_000;

export const REMINDER_CHOICES = [
  'none',
  'at_due',
  'minutes_15',
  'hour_1',
  'day_1',
  'custom',
] as const;

export type ReminderChoice = (typeof REMINDER_CHOICES)[number];

type ShortcutChoice = Exclude<ReminderChoice, 'none' | 'custom'>;

// Minutes before the due time.
const SHORTCUT_OFFSETS: Readonly<Record<ShortcutChoice, number>> = {
  at_due: 0,
  minutes_15: 15,
  hour_1: 60,
  day_1: 24 * 60,
};

const CHOICE_LABELS: Readonly<Record<ReminderChoice, string>> = {
  none: 'No reminder',
  at_due: 'At due time',
  minutes_15: '15 minutes before',
  hour_1: '1 hour before',
  day_1: '1 day before',
  custom: 'Custom time',
};

function isShortcut(choice: ReminderChoice): choice is ShortcutChoice {
  return choice !== 'none' && choice !== 'custom';
}

function shortcutInstant(choice: ShortcutChoice, dueAt: string): string {
  return new Date(Date.parse(dueAt) - SHORTCUT_OFFSETS[choice] * MINUTE_MS).toISOString();
}

function hasPassed(choice: ShortcutChoice, dueAt: string, now: Date): boolean {
  return Date.parse(shortcutInstant(choice, dueAt)) <= now.getTime();
}

// The instant a choice stands for; custom is read from its own fields by the caller.
export function reminderInstant(
  choice: ReminderChoice,
  dueAt: string,
  customAt: string | null,
): string | null {
  if (choice === 'none') {
    return null;
  }
  return isShortcut(choice) ? shortcutInstant(choice, dueAt) : customAt;
}

// A shortcut is offered as passed once the due time is known and its moment is not ahead.
export function reminderOptions(dueAt: string | null, now: Date | null): readonly SelectOption[] {
  return REMINDER_CHOICES.map((choice) => {
    const label = CHOICE_LABELS[choice];
    const isPassed =
      isShortcut(choice) && dueAt !== null && now !== null && hasPassed(choice, dueAt, now);
    return isPassed
      ? { value: choice, label: `${label} (passed)`, isDisabled: true }
      : { value: choice, label };
  });
}

// The reminder of a new task the user has not chosen one for: at the due time while that is ahead
// or not known yet.
export function defaultReminder(dueAt: string | null, now: Date): ReminderChoice {
  return dueAt !== null && hasPassed('at_due', dueAt, now) ? 'none' : 'at_due';
}

// The shortcut whose offset matches to the minute, or a custom time.
export function choiceFor(dueAt: string, remindAt: string | null): ReminderChoice {
  if (remindAt === null) {
    return 'none';
  }
  const minutesBefore = Math.round((Date.parse(dueAt) - Date.parse(remindAt)) / MINUTE_MS);
  const shortcuts = REMINDER_CHOICES.filter(isShortcut);
  return shortcuts.find((choice) => SHORTCUT_OFFSETS[choice] === minutesBefore) ?? 'custom';
}

export function toReminderChoice(value: string): ReminderChoice | undefined {
  return REMINDER_CHOICES.find((choice) => choice === value);
}
