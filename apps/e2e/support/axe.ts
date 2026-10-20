import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS: ReadonlySet<string> = new Set(['serious', 'critical']);

interface KnownViolation {
  readonly rule: string;
  // A fragment of the element's HTML that singles it out.
  readonly element: string;
}

// One rule on one element each, so the rule still checks the rest; each fix is its own pull request.
const KNOWN_VIOLATIONS: readonly KnownViolation[] = [
  // The account button shows the user's initials but is named "Account"; its look needs a design call.
  { rule: 'label-content-name-mismatch', element: 'aria-label="Account"' },
];

function isKnown(rule: string, html: string): boolean {
  return KNOWN_VIOLATIONS.some((known) => known.rule === rule && html.includes(known.element));
}

export interface Violation {
  readonly rule: string;
  readonly impact: string;
  readonly targets: readonly string[];
}

export async function findSeriousViolations(page: Page): Promise<readonly Violation[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  const serious: Violation[] = [];
  for (const { id, impact, nodes } of violations) {
    if (impact === undefined || impact === null || !BLOCKING_IMPACTS.has(impact)) {
      continue;
    }
    const targets = nodes
      .filter(({ html }) => !isKnown(id, html))
      .map(({ target }) => target.join(' '));
    if (targets.length > 0) {
      serious.push({ rule: id, impact, targets });
    }
  }
  return serious;
}
