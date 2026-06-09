import { Election, PollsState } from '@votingworks/types';
import {
  PollingPlacePickerMode,
  PollingPlacePicker,
  PollingPlacePickerProps,
} from '@votingworks/ui';
import React from 'react';

export interface LocationPickerProps {
  election: Election;
  pollingPlaceId?: string;
  pollsState: PollsState;
  selectPollingPlace: PollingPlacePickerProps['selectPlace'];
}

export function LocationPicker(props: LocationPickerProps): React.ReactNode {
  const { election, pollingPlaceId, pollsState, selectPollingPlace } = props;

  const nLocations = (election.pollingPlaces || []).length;
  if (nLocations <= 1) return null;

  const mode: PollingPlacePickerMode =
    pollsState === 'polls_closed_final' ? 'disabled' : 'default';

  return (
    <PollingPlacePicker
      mode={mode}
      places={election.pollingPlaces || []}
      selectedId={pollingPlaceId}
      selectPlace={selectPollingPlace}
    />
  );
}
