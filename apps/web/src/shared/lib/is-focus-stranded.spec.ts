import { afterEach, describe, expect, it } from 'vitest';

import { isFocusStranded } from './is-focus-stranded';

function focusedButton(): HTMLButtonElement {
  const button = document.createElement('button');
  document.body.append(button);
  button.focus();
  return button;
}

describe('isFocusStranded', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('should be true when focus has fallen back to the body', () => {
    focusedButton().remove();

    expect(isFocusStranded()).toBe(true);
  });

  it('should be true when focus stays on a button that was disabled', () => {
    focusedButton().disabled = true;

    expect(isFocusStranded()).toBe(true);
  });

  it('should be false when an enabled control holds focus', () => {
    focusedButton();

    expect(isFocusStranded()).toBe(false);
  });
});
