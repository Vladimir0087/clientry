'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';

import { ApiError } from '@/shared/api/api-error';
import { LOGIN_PATH } from '@/shared/lib/redirect-target';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { FieldGroup } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { registerRequestSchema } from '@clientry/shared/auth';
import type { RegisterRequest } from '@clientry/shared/auth';

import { AuthSwitchLink } from './auth-switch-link';
import { PasswordField } from './password-field';
import { useEnterSession } from '../model/use-enter-session';
import { useRegister } from '../model/use-register';

const REGISTER_FIELDS = ['name', 'workspaceName', 'email', 'password'] as const;
const EMAIL_TAKEN = 'EMAIL_TAKEN';

function applyRegisterError(
  error: unknown,
  form: UseFormReturn<RegisterRequest>,
): FormAlertContent | null {
  if (error instanceof ApiError && error.code === EMAIL_TAKEN) {
    form.setError(
      'email',
      { type: 'server', message: 'An account with this email already exists.' },
      { shouldFocus: true },
    );
    return null;
  }
  return applySubmitError(error, form, REGISTER_FIELDS);
}

interface RegisterFormProps {
  readonly next: string | undefined;
}

export function RegisterForm({ next }: RegisterFormProps): React.JSX.Element {
  const form = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    mode: 'onTouched',
    defaultValues: { name: '', workspaceName: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const register = useRegister();
  const { isEntering, enterSession } = useEnterSession(next);

  const handleSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      enterSession(await register.mutateAsync(values));
    } catch (error) {
      setAlert(applyRegisterError(error, form));
    }
  });

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FormAlert alert={alert} />
      <FieldGroup>
        <TextField
          label="Your name"
          autoComplete="name"
          error={errors.name?.message}
          {...form.register('name')}
        />
        <TextField
          label="Workspace name"
          autoComplete="organization"
          error={errors.workspaceName?.message}
          {...form.register('workspaceName')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <PasswordField
          label="Password"
          hint="At least 12 characters"
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
      </FieldGroup>
      <SubmitButton className="w-full" isSubmitting={isSubmitting || isEntering}>
        Create account
      </SubmitButton>
      <AuthSwitchLink prompt="Already have an account?" path={LOGIN_PATH} next={next}>
        Log in
      </AuthSwitchLink>
    </form>
  );
}
