const STAGE_LABEL_LENGTH = 18;

// Axis labels only; the tooltip and the hidden table show the full name.
export function truncateStageLabel(label: string): string {
  return label.length > STAGE_LABEL_LENGTH ? `${label.slice(0, STAGE_LABEL_LENGTH)}…` : label;
}
