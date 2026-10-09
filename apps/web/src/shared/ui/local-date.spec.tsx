import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocalDate } from './local-date';

const VALUE = '2026-10-08T09:30:00.000Z';

describe('LocalDate', () => {
  it('should render the time element without text when it is rendered on the server', () => {
    const html = renderToString(<LocalDate value={VALUE} />);

    expect(html).toBe(`<time dateTime="${VALUE}"></time>`);
  });

  it('should show the date in the browser time zone when it has hydrated', () => {
    const expected = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
      new Date(VALUE),
    );

    render(<LocalDate value={VALUE} />);

    const time = screen.getByText(expected);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', VALUE);
  });
});
