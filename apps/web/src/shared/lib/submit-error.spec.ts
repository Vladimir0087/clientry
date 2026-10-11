import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ApiError, UNEXPECTED_RESPONSE } from '@/shared/api/api-error';

import { applySubmitError, unexpectedAlert } from './submit-error';
import type { FormAlertContent } from './submit-error';

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

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

describe('unexpectedAlert', () => {
  it('should ask to retry in a minute when a server error has no problem details', () => {
    const error = new ApiError({ status: 504, code: UNEXPECTED_RESPONSE });

    expect(unexpectedAlert(error)).toEqual({
      message: 'The server is waking up or busy. Try again in a minute.',
    });
  });

  it("should keep the generic message with the reference when the API's own 500 fails", () => {
    const error = new ApiError({ status: 500, code: 'INTERNAL_ERROR', requestId: 'req-500' });

    expect(unexpectedAlert(error)).toEqual({ message: GENERIC_MESSAGE, reference: 'req-500' });
  });

  it('should keep the generic message when a client error has no problem details', () => {
    const error = new ApiError({ status: 404, code: UNEXPECTED_RESPONSE });

    expect(unexpectedAlert(error)).toEqual({ message: GENERIC_MESSAGE, reference: undefined });
  });
});
