export const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function numbersOf(match: RegExpExecArray | null): number[] | null {
  return match === null ? null : match.slice(1).map(Number);
}

// Read in the browser's zone: a time a clock change skips moves forward, one it repeats takes the
// first, as Date does.
export function toInstant(date: string, time: string): string | null {
  const dateParts = numbersOf(DATE_PATTERN.exec(date));
  const timeParts = numbersOf(TIME_PATTERN.exec(time));
  if (dateParts === null || timeParts === null) {
    return null;
  }
  const [year = 0, month = 1, day = 1] = dateParts;
  const [hours = 0, minutes = 0] = timeParts;
  const local = new Date(year, month - 1, day, hours, minutes);
  // Years below 100 would otherwise read as 19xx.
  local.setFullYear(year, month - 1, day);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

// The value of an <input type="date"> for the instant in the browser's zone.
export function toDateInput(instant: string): string {
  const local = new Date(instant);
  return `${pad(local.getFullYear(), 4)}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

// The value of an <input type="time">.
export function toTimeInput(instant: string): string {
  const local = new Date(instant);
  return `${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

// For text that cannot hold a <LocalDate>, such as a field hint; call it in the browser only.
export function formatDateTime(instant: string): string {
  return DATE_TIME_FORMAT.format(new Date(instant));
}
