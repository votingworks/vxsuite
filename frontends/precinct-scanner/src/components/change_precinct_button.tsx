import React, { useState } from 'react';
import { Button, Modal, Prose, Select } from '@votingworks/ui';
import {
  Election,
  PollsState,
  PrecinctSelection,
  SelectChangeEventFunction,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  areEqualPrecinctSelections,
  assert,
  assertDefined,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';
export const ALL_PRECINCTS_OPTION_VALUE = 'ALL_PRECINCTS_OPTION_VALUE';

export interface ChangePrecinctButtonProps {
  appPrecinctSelection?: PrecinctSelection;
  updatePrecinctSelection: (
    precinctSelection: PrecinctSelection
  ) => Promise<void>;
  election: Election;
  ballotsCast: boolean;
  pollsState: PollsState;
}

export function ChangePrecinctButton({
  appPrecinctSelection,
  updatePrecinctSelection,
  election,
  ballotsCast,
  pollsState,
}: ChangePrecinctButtonProps): JSX.Element {
  const requireConfirmation = pollsState !== 'polls_closed_initial';
  const disableChange = ballotsCast || pollsState === 'polls_closed_final';
  const [isConfirmationModalShowing, setIsConfirmationModalShowing] =
    useState(false);
  const [unconfirmedPrecinctSelection, setUnconfirmedPrecinctSelection] =
    useState<PrecinctSelection>();

  function openModal() {
    setIsConfirmationModalShowing(true);
  }

  function closeModal() {
    setIsConfirmationModalShowing(false);
    setUnconfirmedPrecinctSelection(undefined);
  }

  const handlePrecinctSelectionChange: SelectChangeEventFunction = async (
    event
  ) => {
    const { value } = event.currentTarget;
    const newPrecinctSelection =
      value === ALL_PRECINCTS_OPTION_VALUE
        ? ALL_PRECINCTS_SELECTION
        : singlePrecinctSelectionFor(value);

    if (requireConfirmation) {
      setUnconfirmedPrecinctSelection(newPrecinctSelection);
    } else {
      await updatePrecinctSelection(newPrecinctSelection);
    }
  };

  async function confirmPrecinctChange() {
    assert(unconfirmedPrecinctSelection);
    await updatePrecinctSelection(unconfirmedPrecinctSelection);
    closeModal();
  }

  const dropdownPrecinctSelection =
    unconfirmedPrecinctSelection || appPrecinctSelection;

  const dropdownCurrentValue = dropdownPrecinctSelection
    ? dropdownPrecinctSelection.kind === 'AllPrecincts'
      ? ALL_PRECINCTS_OPTION_VALUE
      : dropdownPrecinctSelection.precinctId
    : '';

  const precinctSelectDropdown = (
    <Select
      id="selectPrecinct"
      data-testid="selectPrecinct"
      value={dropdownCurrentValue}
      onBlur={handlePrecinctSelectionChange}
      onChange={handlePrecinctSelectionChange}
      large
    >
      {!requireConfirmation && (
        <option value="" disabled>
          {SELECT_PRECINCT_TEXT}
        </option>
      )}
      <option
        value={ALL_PRECINCTS_OPTION_VALUE}
        disabled={appPrecinctSelection?.kind === 'AllPrecincts'}
      >
        {ALL_PRECINCTS_NAME}
      </option>
      {[...election.precincts]
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            ignorePunctuation: true,
          })
        )
        .map((precinct) => (
          <option
            key={precinct.id}
            value={precinct.id}
            disabled={
              appPrecinctSelection?.kind === 'SinglePrecinct' &&
              appPrecinctSelection.precinctId === precinct.id
            }
          >
            {precinct.name}
          </option>
        ))}
    </Select>
  );

  return pollsState === 'polls_closed_initial' ? (
    precinctSelectDropdown
  ) : (
    <React.Fragment>
      <Button onPress={openModal} large disabled={disableChange}>
        Change Precinct
      </Button>
      {isConfirmationModalShowing && (
        <Modal
          content={
            <Prose>
              <h1>Change Precinct</h1>
              <p>
                WARNING: The polls are open on this machine. Changing the
                precinct will reset the polls to closed. To resume voting, the
                polls must be reopened. Please select a precinct and confirm
                below.
              </p>
              <Prose textCenter>{precinctSelectDropdown}</Prose>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={confirmPrecinctChange}
                disabled={
                  !unconfirmedPrecinctSelection ||
                  areEqualPrecinctSelections(
                    assertDefined(appPrecinctSelection),
                    unconfirmedPrecinctSelection
                  )
                }
              >
                Confirm
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}
