import React, { useState } from 'react';
import {
  Election,
  PrecinctSelection,
  SelectChangeEventFunction,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { Select } from './select';
import { Button } from './button';
import { Modal } from './modal';
import { Prose } from './prose';
import { Font, H1, P } from './typography';
import { Icons } from './icons';

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
}

export function ChangePrecinctButton({
  appPrecinctSelection,
  updatePrecinctSelection,
  election,
  mode,
}: ChangePrecinctButtonProps): JSX.Element {
  const [isConfirmationModalShowing, setIsConfirmationModalShowing] =
    useState(false);
  const [unconfirmedPrecinctSelection, setUnconfirmedPrecinctSelection] =
    useState<PrecinctSelection>();

  const dropdownPrecinctSelection =
    unconfirmedPrecinctSelection || appPrecinctSelection;

  const dropdownCurrentValue = dropdownPrecinctSelection
    ? dropdownPrecinctSelection.kind === 'AllPrecincts'
      ? ALL_PRECINCTS_OPTION_VALUE
      : dropdownPrecinctSelection.precinctId
    : '';

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
    if (!value) return; // in case of blur on placeholder option

    if (value === dropdownCurrentValue) {
      // blur on current value should be no-op
      return;
    }

    const newPrecinctSelection =
      value === ALL_PRECINCTS_OPTION_VALUE
        ? ALL_PRECINCTS_SELECTION
        : singlePrecinctSelectionFor(value);

    if (mode === 'confirmation_required') {
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

  const precinctSelectDropdown = (
    <Select
      id="selectPrecinct"
      data-testid="selectPrecinct"
      value={dropdownCurrentValue}
      onBlur={handlePrecinctSelectionChange}
      onChange={handlePrecinctSelectionChange}
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
      <Button onPress={openModal}>Change Precinct</Button>
      {isConfirmationModalShowing && (
        <Modal
          content={
            <Prose>
              <H1>Change Precinct</H1>
              <P>
                <Icons.Warning color="warning" />{' '}
                <Font weight="bold">WARNING:</Font> The polls are open on this
                machine. Changing the precinct will reset the polls to closed.
                To resume voting, the polls must be opened again. Please select
                a precinct and confirm below.
              </P>
              <Prose textCenter>{precinctSelectDropdown}</Prose>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                variant="danger"
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
