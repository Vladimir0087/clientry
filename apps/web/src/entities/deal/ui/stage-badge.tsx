import type * as React from 'react';

import { Badge } from '@/shared/ui/badge';
import type { Stage, StageKind } from '@clientry/shared/deals';

type BadgeVariant = 'secondary' | 'success' | 'danger';

const KIND_VARIANTS: Readonly<Record<StageKind, BadgeVariant>> = {
  open: 'secondary',
  won: 'success',
  lost: 'danger',
};

const KIND_LABELS: Readonly<Record<StageKind, string | null>> = {
  open: null,
  won: 'Won',
  lost: 'Lost',
};

// "Won" or "Lost" next to a closed stage's name; nothing for an open stage.
export function StageKindBadge({ kind }: { readonly kind: StageKind }): React.JSX.Element | null {
  const label = KIND_LABELS[kind];
  return label === null ? null : <Badge variant={KIND_VARIANTS[kind]}>{label}</Badge>;
}

export function StageBadge({ stage }: { readonly stage: Stage }): React.JSX.Element {
  return (
    <Badge variant={KIND_VARIANTS[stage.kind]} className="max-w-full">
      <span className="truncate">{stage.name}</span>
    </Badge>
  );
}
