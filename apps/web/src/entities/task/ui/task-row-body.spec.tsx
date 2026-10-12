import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { formatDateTime } from '@/shared/lib/local-date-time';

import { TaskRowBody } from './task-row-body';
import { makeTask } from '../../../../test/tasks';

const PAST_DUE = makeTask(1, { dueAt: '2020-01-01T09:00:00.000Z' });

describe('TaskRowBody', () => {
  it('should leave Overdue out of the server HTML when the task is past due', () => {
    const html = renderToString(<TaskRowBody task={PAST_DUE} index={0} isAssigneeShown />);

    expect(html).not.toContain('Overdue');
  });

  it('should show Overdue after hydration when an open task is past due', () => {
    render(<TaskRowBody task={PAST_DUE} index={0} isAssigneeShown={false} />);

    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('should show Done instead of Overdue when a past due task is done', () => {
    const done = { ...PAST_DUE, doneAt: '2020-01-02T09:00:00.000Z' };

    render(<TaskRowBody task={done} index={0} isAssigneeShown={false} />);

    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: done.title })).toHaveClass('line-through');
  });

  it('should show the due date and time and the day it was done when the task is done', () => {
    const done = makeTask(6, {
      dueAt: '2026-10-14T09:00:00.000Z',
      doneAt: '2026-10-15T09:00:00.000Z',
    });

    render(<TaskRowBody task={done} index={0} isAssigneeShown={false} />);

    expect(screen.getByText('Due').parentElement).toHaveTextContent(
      `Due ${formatDateTime(done.dueAt)}`,
    );
    expect(screen.getByText(/^Done/)).toHaveTextContent(/^Done \w{3} \d{1,2}, \d{4}$/);
  });

  it('should not show Overdue when the task is due ahead', () => {
    render(<TaskRowBody task={makeTask(2)} index={0} isAssigneeShown={false} />);

    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
  });

  it('should name the reminder for screen readers when it is set and unsent', () => {
    render(<TaskRowBody task={makeTask(3)} index={0} isAssigneeShown={false} />);

    expect(screen.getByText(/Reminder at/)).toHaveClass('sr-only');
  });

  it('should leave the reminder out when it was sent', () => {
    const sent = makeTask(4, { reminderSentAt: '2099-10-15T11:00:01.000Z' });

    render(<TaskRowBody task={sent} index={0} isAssigneeShown={false} />);

    expect(screen.queryByText(/Reminder at/)).not.toBeInTheDocument();
  });

  it('should leave the unsent reminder out when the task is done', () => {
    const done = makeTask(5, { doneAt: '2026-10-14T09:00:00.000Z' });

    render(<TaskRowBody task={done} index={0} isAssigneeShown={false} />);

    expect(screen.queryByText(/Reminder at/)).not.toBeInTheDocument();
  });
});
