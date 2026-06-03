/* istanbul ignore file */

import React from 'react';
import { PollingPlaceType } from '@votingworks/types';
import { CvrCard } from './00_cvr_card';
import { usePollingPlaceCvrs } from './00_hooks';

export interface PrecinctSummaryProps {
  id: string;
  name: string;
  onSelect: (placeId: string) => void;
  selected: boolean;
  type: PollingPlaceType;
}

export type PrecinctSummaryMode = 'card' | 'row';

export function PrecinctSummary(props: PrecinctSummaryProps): React.ReactNode {
  const { id, name, onSelect, selected, type } = props;

  const cvrs = usePollingPlaceCvrs(id);
  if (!cvrs) return null;

  return (
    <CvrCard
      count={cvrs.count}
      fileCount={cvrs.fileCount}
      id={id}
      machineIds={cvrs.machineIds}
      onSelect={onSelect}
      selected={selected}
      showTotalSection
      title={name}
      type={type}
    />
  );
}
