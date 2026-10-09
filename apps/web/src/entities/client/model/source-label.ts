import { clientSourceSchema } from '@clientry/shared/clients';
import type { ClientSource } from '@clientry/shared/clients';

const SOURCE_LABELS: Readonly<Record<ClientSource, string>> = {
  website: 'Website',
  telegram: 'Telegram',
  referral: 'Referral',
  other: 'Other',
};

export const CLIENT_SOURCES: readonly ClientSource[] = clientSourceSchema.options;

export function sourceLabel(source: ClientSource): string {
  return SOURCE_LABELS[source];
}
