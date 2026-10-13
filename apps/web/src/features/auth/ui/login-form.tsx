'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';

import { ApiError } from '@/shared/api/api-error';
import { REGISTER_PATH } from '@/shared/lib/redirect-target';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { FieldGroup } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { loginRequestSchema } from '@clientry/shared/auth';
import type { LoginRequest } from '@clientry/shared/auth';

import { AuthSwitchLink } from './auth-switch-link';
import { PasswordField } from './password-field';
import { useEnterSession } from '../model/use-enter-session';
import { useLogin } from '../model/use-login';

const LOGIN_FIELDS = ['email', 'password'] as const;
const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
const NO_WORKSPACE = 'NO_WORKSPACE';

function applyLoginError(
  error: unknown,
  form: UseFormReturn<LoginRequest>,
): FormAlertContent | null {
  if (error instanceof ApiError && error.code === INVALID_CREDENTIALS) {
    form.resetField('password');
    form.setFocus('password');
    return { message: 'Email or password is incorrect.' };
  }
  if (error instanceof ApiError && error.code === NO_WORKSPACE) {
    return {
      message: 'This account is not a member of any workspace. Ask an owner for an invite link.',
    };
  }
  return applySubmitError(error, form, LOGIN_FIELDS);
}

interface LoginFormProps {
  readonly next: string | undefined;
}

export function LoginForm({ next }: LoginFormProps): React.JSX.Element {
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const login = useLogin();
  const { isEntering, enterSession } = useEnterSession(next);

  const handleSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      enterSession(await login.mutateAsync(values));
    } catch (error) {
      setAlert(applyLoginError(error, form));
    }
  });

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FormAlert alert={alert} />
      <FieldGroup>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
      </FieldGroup>
      <SubmitButton className="w-full" isSubmitting={isSubmitting || isEntering}>
        Log in
      </SubmitButton>
      <AuthSwitchLink prompt="No account?" path={REGISTER_PATH} next={next}>
        Create one
      </AuthSwitchLink>
    </form>
  );
}
