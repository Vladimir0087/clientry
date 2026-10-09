import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { TagsMenu } from './filter-menus';
import { recordRequests } from '../../../../test/msw/record';
import { renderWithProviders } from '../../../../test/render';

async function openTagsMenu(): Promise<void> {
  renderWithProviders(<TagsMenu selected={[]} onChange={() => undefined} />);
  await userEvent.click(screen.getByRole('button', { name: /^Tags/ }));
}

describe('TagsMenu', () => {
  it('should say the tags are loading when the request has not answered yet', async () => {
    recordRequests('get', '/api/clients/tags', () => new Promise<Response>(() => undefined));

    await openTagsMenu();

    expect(await screen.findByText('Loading tags…')).toBeInTheDocument();
  });

  it('should say the tags could not load when the request fails', async () => {
    recordRequests('get', '/api/clients/tags', () =>
      HttpResponse.json({ message: 'Bad request' }, { status: 400 }),
    );

    await openTagsMenu();

    expect(await screen.findByText('Could not load tags')).toBeInTheDocument();
  });

  it('should say there are no tags when the workspace has none', async () => {
    await openTagsMenu();

    expect(await screen.findByText('No tags yet')).toBeInTheDocument();
  });

  it('should list the tags with their counts when they load', async () => {
    recordRequests('get', '/api/clients/tags', () =>
      HttpResponse.json({ items: [{ tag: 'vip', count: 3 }] }),
    );

    await openTagsMenu();

    expect(await screen.findByRole('menuitemcheckbox', { name: /^vip/ })).toHaveTextContent('3');
    expect(screen.queryByText('No tags yet')).not.toBeInTheDocument();
  });
});
