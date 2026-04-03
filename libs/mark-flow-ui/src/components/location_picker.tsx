import { PrecinctSelection, Election, PollsState } from '@votingworks/types';
import {
  PollingPlacePickerMode,
  ChangePrecinctButton,
  PollingPlacePicker,
  ChangePrecinctButtonProps,
  PollingPlacePickerProps,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import React from 'react';

export interface LocationPickerProps {
  appPrecinct?: PrecinctSelection;
  election: Election;
  pollingPlaceId?: string;
  pollsState: PollsState;
  selectPollingPlace: PollingPlacePickerProps['selectPlace'];
  selectPrecinct: ChangePrecinctButtonProps['updatePrecinctSelection'];
}

export function LocationPicker(props: LocationPickerProps): React.ReactNode {
  const {
    appPrecinct,
    election,
    pollingPlaceId,
    pollsState,
    selectPollingPlace,
    selectPrecinct,
  } = props;

  const { ENABLE_POLLING_PLACES } = BooleanEnvironmentVariableName;
  const pollingPlacesEnabled = isFeatureFlagEnabled(ENABLE_POLLING_PLACES);

  /* istanbul ignore next - precincts branch tested via apps - @preserve */
  const nLocations = pollingPlacesEnabled
    ? election.pollingPlaces?.length || 0
    : election.precincts.length;

  if (nLocations <= 1) return null;

  const mode: PollingPlacePickerMode =
    pollsState === 'polls_closed_final' ? 'disabled' : 'default';

  /* istanbul ignore next - tested via apps - @preserve */
  if (!pollingPlacesEnabled) {
    return (
      <ChangePrecinctButton
        appPrecinctSelection={appPrecinct}
        election={election}
        mode={mode}
        updatePrecinctSelection={selectPrecinct}
      />
    );
  }

  return (
    <PollingPlacePicker
      mode={mode}
      places={election.pollingPlaces || []}
      selectedId={pollingPlaceId}
      selectPlace={selectPollingPlace}
    />
  );
}
