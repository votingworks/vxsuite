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
import { Loading } from './loading';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';
export const ALL_PRECINCTS_OPTION_VALUE = 'ALL_PRECINCTS_OPTION_VALUE';

export type ChangePrecinctMode =
  | 'default'
  | 'confirmation_required'
  | 'disabled';

type ModalShown = 'none' | 'confirmation' | 'changing_precinct';

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
  const [modalShown, setModalShown] = useState<ModalShown>('none');
  const [unconfirmedPrecinctSelection, setUnconfirmedPrecinctSelection] =
    useState<PrecinctSelection>();

  function closeConfirmationModal() {
    setModalShown('none');
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
    // In case of a blur on the placeholder option
    if (!value) return;
    // When there is a re-render right after a select option, the event can
    // refire. To avoid responding to that event, check if we have already
    if (modalShown === 'changing_precinct') return;

    const newPrecinctSelection =
      value === ALL_PRECINCTS_OPTION_VALUE
        ? ALL_PRECINCTS_SELECTION
        : singlePrecinctSelectionFor(value);

    if (mode === 'confirmation_required') {
      setUnconfirmedPrecinctSelection(newPrecinctSelection);
    } else {
      setModalShown('changing_precinct');
      await updatePrecinctSelectionAndLog(newPrecinctSelection);
      setModalShown('none');
    }
  };

  async function confirmPrecinctChange() {
    assert(unconfirmedPrecinctSelection);
    setModalShown('changing_precinct');
    await updatePrecinctSelectionAndLog(unconfirmedPrecinctSelection);
    closeConfirmationModal();
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
      disabled={mode === 'disabled' || modalShown === 'changing_precinct'}
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

  return (
    <React.Fragment>
      {mode === 'default' || mode === 'disabled' ? (
        precinctSelectDropdown
      ) : (
        <Button onPress={() => setModalShown('confirmation')} large>
          Change Precinct
        </Button>
      )}
      {modalShown === 'changing_precinct' && <Modal content={<Loading />} />}
      {modalShown === 'confirmation' && (
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
                disabled={!unconfirmedPrecinctSelection}
              >
                Confirm
              </Button>
              <Button onPress={closeConfirmationModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmationModal}
        />
      )}
    </React.Fragment>
  );
}
