import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

import { TagInput } from './tag-input';

function ControlledTags({ initial = [] }: { readonly initial?: string[] }): React.JSX.Element {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <label htmlFor="tags">Tags</label>
      <TagInput
        id="tags"
        aria-invalid={false}
        aria-describedby={undefined}
        ref={() => undefined}
        value={tags}
        suggestions={[]}
        onChange={setTags}
        onBlur={() => undefined}
      />
      <output>{tags.join('|')}</output>
    </>
  );
}

function shownTags(): string {
  return screen.getByRole('status').textContent;
}

describe('TagInput', () => {
  it.each(['{Enter}', ','])('should add the tag lowercased when %s is pressed', async (key) => {
    const user = userEvent.setup();
    render(<ControlledTags />);

    await user.type(screen.getByLabelText('Tags'), `VIP${key}`);

    expect(shownTags()).toBe('vip');
    expect(screen.getByLabelText('Tags')).toHaveValue('');
  });

  it('should add the tag when a comma arrives in the text without its key', () => {
    render(<ControlledTags />);

    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'vip,' } });

    expect(shownTags()).toBe('vip');
    expect(screen.getByLabelText('Tags')).toHaveValue('');
  });

  it('should add every finished tag and keep the rest when a list is pasted', async () => {
    const user = userEvent.setup();
    render(<ControlledTags />);
    await user.click(screen.getByLabelText('Tags'));

    await user.paste('vip, warm, lead');

    expect(shownTags()).toBe('vip|warm');
    expect(screen.getByLabelText('Tags')).toHaveValue('lead');
  });

  it('should ignore the tag when it is already there', async () => {
    const user = userEvent.setup();
    render(<ControlledTags initial={['vip']} />);

    await user.type(screen.getByLabelText('Tags'), 'Vip{Enter}');

    expect(shownTags()).toBe('vip');
  });

  it('should remove the last tag when Backspace is pressed in an empty input', async () => {
    const user = userEvent.setup();
    render(<ControlledTags initial={['vip', 'warm']} />);

    await user.type(screen.getByLabelText('Tags'), '{Backspace}');

    expect(shownTags()).toBe('vip');
  });

  it('should remove the tag and focus the input when its remove button is pressed', async () => {
    const user = userEvent.setup();
    render(<ControlledTags initial={['vip', 'warm']} />);

    await user.click(screen.getByRole('button', { name: 'Remove tag vip' }));

    expect(shownTags()).toBe('warm');
    expect(screen.getByLabelText('Tags')).toHaveFocus();
  });

  it('should move focus to the last chip when the tenth tag disables the input', async () => {
    const user = userEvent.setup();
    const tags = Array.from({ length: 9 }, (_, index) => `tag-${String(index)}`);
    render(<ControlledTags initial={tags} />);

    await user.type(screen.getByLabelText('Tags'), 'last{Enter}');

    expect(screen.getByLabelText('Tags')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove tag last' })).toHaveFocus();
  });

  it('should add the typed text when the input loses focus', async () => {
    const user = userEvent.setup();
    render(<ControlledTags />);

    await user.type(screen.getByLabelText('Tags'), 'warm');
    await user.tab();

    expect(shownTags()).toBe('warm');
  });

  it('should disable the input when there are 10 tags', () => {
    const tags = Array.from({ length: 10 }, (_, index) => `tag-${String(index)}`);

    render(<ControlledTags initial={tags} />);

    expect(screen.getByLabelText('Tags')).toBeDisabled();
  });
});
