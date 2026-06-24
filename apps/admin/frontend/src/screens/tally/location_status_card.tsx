import React from 'react';

import { Icons } from '@votingworks/ui';
import { PollingPlaceType, pollingPlaceTypeName } from '@votingworks/types';

import { LocationCvrCard } from './location_cvr_card';

export interface LocationStatusCardProps {
  cvrCount: number;
  importCount: number;
  id: string;
  name: string;
  onPress: (id: string) => void;
  // eslint-disable-next-line react/no-unused-prop-types
  scannerIds: string[];
  selected: boolean;
  type: PollingPlaceType;
}

export function LocationStatusCard(
  props: LocationStatusCardProps
): JSX.Element {
  const { cvrCount, id, importCount, name, onPress, selected, type } = props;

  return (
    <LocationCvrCard
      caption={
        <React.Fragment>
          {pollingPlaceTypeName(type)} &bull; {importSummary(props)}
        </React.Fragment>
      }
      count={cvrCount}
      icon={
        importCount > 0 ? (
          <Icons.Done color="primary" />
        ) : (
          <Icons.Info color="inverseWarning" />
        )
      }
      id={id}
      name={name}
      onClick={onPress}
      selected={selected}
    />
  );
}

function importSummary(p: LocationStatusCardProps) {
  if (p.importCount === 0) return 'No CVRs loaded yet';

  const scannerSummary =
    p.scannerIds.length === 1
      ? `Scanner ${p.scannerIds[0]}`
      : `${p.scannerIds.length} scanners`;

  return [
    p.importCount.toString(),
    p.importCount === 1 ? 'file' : 'files',
    'from',
    scannerSummary,
  ].join(' ');
}
