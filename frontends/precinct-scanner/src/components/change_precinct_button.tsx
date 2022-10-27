import React, { useState } from 'react';
import { Button, Modal, Prose, Select } from '@votingworks/ui';
import {
  Election,
  PrecinctSelection,
  SelectChangeEventFunction,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  areEqualPrecinctSelections,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

export const ALL_PRECINCTS_OPTION_VALUE = 'ALL_PRECINCTS_OPTION_VALUE';

export interface ChangePrecinctButtonProps {
  initialPrecinctSelection: PrecinctSelection;
  updatePrecinctSelection: (
    precinctSelection: PrecinctSelection
  ) => Promise<void>;
  election: Election;
  disabled?: boolean;
}

export function ChangePrecinctButton({
  initialPrecinctSelection,
  updatePrecinctSelection,
  election,
  disabled,
}: ChangePrecinctButtonProps): JSX.Element {
  const [isModalShowing, setIsModalShowing] = useState(false);
  const [pendingPrecinctSelection, setPendingPrecinctSelection] = useState(
    initialPrecinctSelection
  );

  function openModal() {
    setIsModalShowing(true);
  }

  function closeModal() {
    setIsModalShowing(false);
    setPendingPrecinctSelection(initialPrecinctSelection);
  }

  const handlePendingPrecinctSelectionChange: SelectChangeEventFunction = (
    event
  ) => {
    const { value } = event.currentTarget;
    const newPrecinctSelection =
      value === ALL_PRECINCTS_OPTION_VALUE
        ? ALL_PRECINCTS_SELECTION
        : singlePrecinctSelectionFor(value);

    setPendingPrecinctSelection(newPrecinctSelection);
  };

  async function confirmPrecinctChange() {
    await updatePrecinctSelection(pendingPrecinctSelection);
    closeModal();
  }

  const pendingPrecinctSelectionValue =
    pendingPrecinctSelection.kind === 'AllPrecincts'
      ? ALL_PRECINCTS_OPTION_VALUE
      : pendingPrecinctSelection.precinctId;

  return (
    <React.Fragment>
      <Button onPress={openModal} large disabled={disabled}>
        Change Precinct
      </Button>
      {isModalShowing && (
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
              <Prose textCenter>
                <Select
                  id="selectPrecinct"
                  data-testid="selectPrecinct"
                  value={pendingPrecinctSelectionValue}
                  onBlur={handlePendingPrecinctSelectionChange}
                  onChange={handlePendingPrecinctSelectionChange}
                >
                  {election.precincts.length > 1 && (
                    <option value={ALL_PRECINCTS_OPTION_VALUE}>
                      {ALL_PRECINCTS_NAME}
                    </option>
                  )}
                  {[...election.precincts]
                    .sort((a, b) =>
                      a.name.localeCompare(b.name, undefined, {
                        ignorePunctuation: true,
                      })
                    )
                    .map((precinct) => (
                      <option key={precinct.id} value={precinct.id}>
                        {precinct.name}
                      </option>
                    ))}
                </Select>
              </Prose>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={confirmPrecinctChange}
                disabled={areEqualPrecinctSelections(
                  initialPrecinctSelection,
                  pendingPrecinctSelection
                )}
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
