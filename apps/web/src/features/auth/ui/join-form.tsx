'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { hasErrorCode } from '@/shared/api/api-status';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Button } from '@/shared/ui/button';
import { FieldGroup } from '@/shared/ui/field';
import { FormAlert } from '@/shared/ui/form-alert';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { inviteLoginRequestSchema, inviteRegisterRequestSchema } from '@clientry/shared/auth';
import type {
  InviteLoginRequest,
  InviteRegisterRequest,
  SessionResponse,
} from '@clientry/shared/auth';

import { handleKeepFieldFocus } from './keep-field-focus';
import { PasswordField } from './password-field';
import { useEnterSession } from '../model/use-enter-session';
import { useLoginByInvite, useRegisterByInvite } from '../model/use-invite';

const registerSchema = inviteRegisterRequestSchema.omit({ token: true });
const loginSchema = inviteLoginRequestSchema.omit({ token: true });

type RegisterValues = Omit<InviteRegisterRequest, 'token'>;

type LoginValues = Omit<InviteLoginRequest, 'token'>;

interface JoinFields<T extends FieldValues> {
  readonly all: readonly Path<T>[];
  readonly email: Path<T>;
  readonly password: Path<T>;
}

const REGISTER_FIELDS: JoinFields<RegisterValues> = {
  all: ['name', 'email', 'password'],
  email: 'email',
  password: 'password',
};

const LOGIN_FIELDS: JoinFields<LoginValues> = {
  all: ['email', 'password'],
  email: 'email',
  password: 'password',
};

type JoinMode = 'register' | 'login';

// The codes both modes share; null means the error is shown in a field or handled elsewhere.
function applyJoinError<T extends FieldValues>(
  error: unknown,
  form: UseFormReturn<T>,
  fields: JoinFields<T>,
  onInvalid: () => void,
): FormAlertContent | null {
  if (hasErrorCode(error, 'INVITE_INVALID')) {
    onInvalid();
    return null;
  }
  if (hasErrorCode(error, 'EMAIL_TAKEN')) {
    const message = 'An account with this email already exists. Log in to join instead.';
    form.setError(fields.email, { type: 'server', message }, { shouldFocus: true });
    return null;
  }
  if (hasErrorCode(error, 'ALREADY_IN_WORKSPACE')) {
    return { message: 'This account already belongs to a workspace. Use another account.' };
  }
  if (hasErrorCode(error, 'INVALID_CREDENTIALS')) {
    form.resetField(fields.password);
    form.setFocus(fields.password);
    return { message: 'Email or password is incorrect.' };
  }
  return applySubmitError(error, form, fields.all);
}

interface JoinSubmit {
  readonly alert: FormAlertContent | null;
  // Stays true until the page changes after a join, so a second one cannot start.
  readonly isBusy: boolean;
  readonly handleSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
}

function useJoinSubmit<T extends FieldValues>(
  form: UseFormReturn<T>,
  fields: JoinFields<T>,
  join: (values: T) => Promise<SessionResponse>,
  onInvalid: () => void,
): JoinSubmit {
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const { isEntering, enterSession } = useEnterSession(undefined);
  const handleSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      enterSession(await join(values));
    } catch (error) {
      setAlert(applyJoinError(error, form, fields, onInvalid));
    }
  });
  return { alert, isBusy: form.formState.isSubmitting || isEntering, handleSubmit };
}

// Moves focus to the first empty field when the mode switches.
function useFocusFirstEmpty<T extends FieldValues>(
  form: UseFormReturn<T>,
  fields: readonly Path<T>[],
  shouldFocus: boolean,
): void {
  const { getValues, setFocus } = form;
  useEffect(() => {
    if (!shouldFocus) {
      return;
    }
    const target = fields.find((field) => String(getValues(field)) === '') ?? fields[0];
    if (target !== undefined) {
      setFocus(target);
    }
  }, [shouldFocus, fields, getValues, setFocus]);
}

interface ModeFormProps {
  readonly token: string;
  readonly email: string;
  readonly hasSwitched: boolean;
  readonly onSwitch: (email: string) => void;
  // A 404: the link stopped working since the preview.
  readonly onInvalid: () => void;
}

function RegisterMode({
  token,
  email,
  hasSwitched,
  onSwitch,
  onInvalid,
}: ModeFormProps): React.JSX.Element {
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email, password: '' },
  });
  const { errors } = form.formState;
  const join = useRegisterByInvite();
  const { alert, isBusy, handleSubmit } = useJoinSubmit(
    form,
    REGISTER_FIELDS,
    (values) => join.mutateAsync({ ...values, token }),
    onInvalid,
  );
  useFocusFirstEmpty(form, REGISTER_FIELDS.all, hasSwitched);

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
      <SubmitButton className="w-full" isSubmitting={isBusy}>
        Create account and join
      </SubmitButton>
      <ModeSwitch
        prompt="Already have an account?"
        isDisabled={isBusy}
        onClick={() => {
          onSwitch(form.getValues('email'));
        }}
      >
        Log in to join
      </ModeSwitch>
    </form>
  );
}

function LoginMode({
  token,
  email,
  hasSwitched,
  onSwitch,
  onInvalid,
}: ModeFormProps): React.JSX.Element {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email, password: '' },
  });
  const { errors } = form.formState;
  const join = useLoginByInvite();
  const { alert, isBusy, handleSubmit } = useJoinSubmit(
    form,
    LOGIN_FIELDS,
    (values) => join.mutateAsync({ ...values, token }),
    onInvalid,
  );
  useFocusFirstEmpty(form, LOGIN_FIELDS.all, hasSwitched);

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
      <SubmitButton className="w-full" isSubmitting={isBusy}>
        Log in and join
      </SubmitButton>
      <ModeSwitch
        prompt="New to Clientry?"
        isDisabled={isBusy}
        onClick={() => {
          onSwitch(form.getValues('email'));
        }}
      >
        Create an account
      </ModeSwitch>
    </form>
  );
}

interface ModeSwitchProps {
  readonly prompt: string;
  // While a join is sent: switching would unmount the form that shows its outcome.
  readonly isDisabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

// A button, not a link: switching keeps the URL, whose fragment holds the token.
function ModeSwitch({ prompt, isDisabled, onClick, children }: ModeSwitchProps): React.JSX.Element {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {prompt}{' '}
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 font-medium text-foreground"
        disabled={isDisabled}
        onMouseDown={handleKeepFieldFocus}
        onClick={onClick}
      >
        {children}
      </Button>
    </p>
  );
}

interface JoinFormProps {
  readonly token: string;
  readonly onInvalid: () => void;
}

export function JoinForm({ token, onInvalid }: JoinFormProps): React.JSX.Element {
  const [mode, setMode] = useState<JoinMode>('register');
  const [email, setEmail] = useState('');
  const [hasSwitched, setHasSwitched] = useState(false);
  const handleSwitch = (typedEmail: string): void => {
    setEmail(typedEmail);
    setHasSwitched(true);
    setMode((current) => (current === 'register' ? 'login' : 'register'));
  };
  const props = { token, email, hasSwitched, onSwitch: handleSwitch, onInvalid };
  return mode === 'register' ? (
    <RegisterMode key="register" {...props} />
  ) : (
    <LoginMode key="login" {...props} />
  );
}
