import { parseAsStringLiteral, useQueryState } from 'nuqs';

import { CURRENCIES } from '@clientry/shared/deals';
import type { Currency } from '@clientry/shared/deals';

// Pushed, so Back returns to the previous currency; shallow, as nothing on the server reads it.
const currencyParser = parseAsStringLiteral(CURRENCIES).withOptions({
  history: 'push',
  shallow: true,
});

export interface WonCurrencyState {
  readonly currency: Currency | undefined;
  readonly setCurrency: (currency: Currency) => void;
}

// The first of the list is the default and stays out of the URL; a value not in the list shows it.
export function useWonCurrency(currencies: readonly Currency[]): WonCurrencyState {
  const [value, setValue] = useQueryState('currency', currencyParser);
  const [first] = currencies;
  const currency = value !== null && currencies.includes(value) ? value : first;
  return {
    currency,
    setCurrency: (next) => {
      void setValue(next === first ? null : next);
    },
  };
}
