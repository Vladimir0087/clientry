'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { handleInsufficientRole } from '@/entities/session';
import { applySubmitError } from '@/shared/lib/submit-error';
import type { FormAlertContent } from '@/shared/lib/submit-error';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { SubmitButton } from '@/shared/ui/submit-button';
import { TextField } from '@/shared/ui/text-field';
import { renameWorkspaceRequestSchema } from '@clientry/shared/workspaces';
import type { RenameWorkspaceRequest } from '@clientry/shared/workspaces';

import { useRenameWorkspace } from '../model/use-rename-workspace';

const NAME_FIELDS = ['name'] as const;

interface RenameFormProps {
  readonly name: string;
  readonly onDone: () => void;
}

function RenameForm({ name, onDone }: RenameFormProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const rename = useRenameWorkspace();
  const [alert, setAlert] = useState<FormAlertContent | null>(null);
  const form = useForm<RenameWorkspaceRequest>({
    resolver: zodResolver(renameWorkspaceRequestSchema),
    defaultValues: { name },
  });
  const { setFocus } = form;
  const { errors, isSubmitting } = form.formState;
  // The name is trimmed on save, so spaces alone are no change.
  const isChanged = useWatch({ control: form.control, name: 'name' }).trim() !== name;

  useEffect(() => {
    setFocus('name', { shouldSelect: true });
  }, [setFocus]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setAlert(null);
    try {
      await rename.mutateAsync(values.name);
      toast.success('Workspace renamed');
      onDone();
    } catch (error) {
      if (handleInsufficientRole(error, queryClient)) {
        onDone();
        return;
      }
      setAlert(applySubmitError(error, form, NAME_FIELDS));
    }
  });
  // On every control, so Escape works from the buttons too; not while saving.
  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape' && !isSubmitting) {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <form noValidate autoComplete="off" onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormAlert alert={alert} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            label="Workspace name"
            autoComplete="off"
            error={errors.name?.message}
            onKeyDown={handleKeyDown}
            {...form.register('name')}
          />
        </div>
        <div className="flex gap-2">
          <SubmitButton
            isSubmitting={isSubmitting}
            isDisabled={!isChanged}
            onKeyDown={handleKeyDown}
          >
            Save
          </SubmitButton>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={isSubmitting}
            onClick={onDone}
            onKeyDown={handleKeyDown}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}

interface WorkspaceNameProps {
  readonly name: string;
  readonly canRename: boolean;
}

export function WorkspaceName({ name, canRename }: WorkspaceNameProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  const shouldReturnFocusRef = useRef(false);

  // Back to Rename once the form gives way to the text.
  useEffect(() => {
    if (!isEditing && shouldReturnFocusRef.current) {
      shouldReturnFocusRef.current = false;
      renameRef.current?.focus();
    }
  }, [isEditing]);

  // A role lost while editing closes the form for good, so it never reopens by itself.
  if (isEditing && !canRename) {
    setIsEditing(false);
  }
  if (isEditing && canRename) {
    const handleDone = (): void => {
      shouldReturnFocusRef.current = true;
      setIsEditing(false);
    };
    return <RenameForm name={name} onDone={handleDone} />;
  }
  const handleRename = (): void => {
    setIsEditing(true);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <dl className="flex min-w-0 flex-col gap-1">
        <dt className="text-sm text-muted-foreground">Workspace name</dt>
        <dd className="font-medium break-words">{name}</dd>
      </dl>
      {canRename && (
        <Button ref={renameRef} variant="outline" onClick={handleRename}>
          Rename
        </Button>
      )}
    </div>
  );
}
