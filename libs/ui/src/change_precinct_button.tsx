import React, { useState } from 'react';
import {
  Election,
  PrecinctSelection,
  SelectChangeEventFunction,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  assert,
  getPrecinctSelectionName,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { LogEventId, Logger } from '@votingworks/logging';
import { Select } from './select';
import { Button } from './button';
import { Modal } from './modal';
import { Prose } from './prose';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';
export const ALL_PRECINCTS_OPTION_VALUE = 'ALL_PRECINCTS_OPTION_VALUE';

export type ChangePrecinctMode =
  | 'default'
  | 'confirmation_required'
  | 'disabled';

export interface ChangePrecinctButtonProps {
  appPrecinctSelection?: PrecinctSelection;
  updatePrecinctSelection: (
    precinctSelection: PrecinctSelection
  ) => Promise<void>;
  election: Election;
  mode: ChangePrecinctMode;
  logger: Logger;
}

export function ChangePrecinctButton({
  appPrecinctSelection,
  updatePrecinctSelection,
  election,
  mode,
  logger,
}: ChangePrecinctButtonProps): JSX.Element {
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

  async function updatePrecinctSelectionAndLog(
    newPrecinctSelection: PrecinctSelection
  ) {
    await updatePrecinctSelection(newPrecinctSelection);
    await logger.log(
      LogEventId.PrecinctConfigurationChanged,
      'election_manager',
      {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          election.precincts,
          newPrecinctSelection
        )}`,
      }
    );
  }

  const handlePrecinctSelectionChange: SelectChangeEventFunction = async (
    event
  ) => {
    const { value } = event.currentTarget;
    if (!value) return; // in case of blur on placeholder option

    const newPrecinctSelection =
      value === ALL_PRECINCTS_OPTION_VALUE
        ? ALL_PRECINCTS_SELECTION
        : singlePrecinctSelectionFor(value);

    if (mode === 'confirmation_required') {
      setUnconfirmedPrecinctSelection(newPrecinctSelection);
    } else {
      await updatePrecinctSelectionAndLog(newPrecinctSelection);
    }
  };

  async function confirmPrecinctChange() {
    assert(unconfirmedPrecinctSelection);
    await updatePrecinctSelectionAndLog(unconfirmedPrecinctSelection);
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
      disabled={mode === 'disabled'}
    >
      {mode === 'default' && (
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

  return mode === 'default' || mode === 'disabled' ? (
    precinctSelectDropdown
  ) : (
    <React.Fragment>
      <Button onPress={openModal} large>
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
                polls must be opened again. Please select a precinct and confirm
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
                disabled={!unconfirmedPrecinctSelection}
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
