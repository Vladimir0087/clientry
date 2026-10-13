import { z } from 'zod';

import { workspaceNameSchema } from '../auth/credentials.js';

export const renameWorkspaceRequestSchema = z
  .object({ name: workspaceNameSchema })
  .meta({ id: 'RenameWorkspaceRequest' });

export type RenameWorkspaceRequest = z.infer<typeof renameWorkspaceRequestSchema>;

export const workspaceResponseSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: 'Workspace' });

export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
