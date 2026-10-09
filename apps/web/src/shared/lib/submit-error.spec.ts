import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api/api-error';

import { applySubmitError } from './submit-error';
import type { FormAlertContent } from './submit-error';

interface Values {
  readonly name: string;
  readonly tags: string[];
}

const FIELDS = ['name', 'tags'] as const;

function validationError(path: string, message: string): ApiError {
  return new ApiError({ status: 400, code: 'VALIDATION_FAILED', errors: [{ path, message }] });
}

describe('applySubmitError', () => {
  it('should put an item error on its list field when the path is tags.1', () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { name: '', tags: [] } }));

    let alert: FormAlertContent | null = null;
    act(() => {
      alert = applySubmitError(
        validationError('tags.1', 'Tags must be unique'),
        result.current,
        FIELDS,
      );
    });

    expect(alert).toBeNull();
    expect(result.current.getFieldState('tags').error?.message).toBe('Tags must be unique');
  });

  it('should send the message to the alert when the path names no field', () => {
    const { result } = renderHook(() => useForm<Values>({ defaultValues: { name: '', tags: [] } }));

    let alert: FormAlertContent | null = null;
    act(() => {
      alert = applySubmitError(validationError('tagsx', 'Unknown'), result.current, FIELDS);
    });

    expect(alert).toEqual({ message: 'Unknown' });
  });
});
