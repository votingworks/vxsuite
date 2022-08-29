import React, { useState } from 'react';
import { sleep } from '@votingworks/utils';

import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { Prose } from './prose';

interface Props {
  unconfigureMachine: () => Promise<void>;
  isMachineConfigured: boolean;
}

/**
 * Because machine unconfiguration can be close to instantaneous on some machines, add an
 * artificial delay (as needed) such that the "Deleting election data..." text is visible, and
 * users get proper feedback
 */
export const MIN_TIME_TO_UNCONFIGURE_MACHINE_MS = 1000;

/**
 * A button with a confirmation modal for unconfiguring machines
 */
export function UnconfigureMachineButton({
  unconfigureMachine,
  isMachineConfigured,
}: Props): JSX.Element {
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isUnconfiguringMachine, setIsUnconfiguringMachine] = useState(false);

  function openConfirmationModal() {
    setIsConfirmationModalOpen(true);
  }

  function closeConfirmationModal() {
    setIsConfirmationModalOpen(false);
  }

  async function unconfigureMachineAndDelay() {
    setIsUnconfiguringMachine(true);

    const start = new Date().getTime();
    await unconfigureMachine();
    const timeToUnconfigureMachineMs = new Date().getTime() - start;

    if (timeToUnconfigureMachineMs < MIN_TIME_TO_UNCONFIGURE_MACHINE_MS) {
      await sleep(
        MIN_TIME_TO_UNCONFIGURE_MACHINE_MS - timeToUnconfigureMachineMs
      );
    }

    closeConfirmationModal();
    setIsUnconfiguringMachine(false);
  }

  return (
    <React.Fragment>
      <Button
        danger
        onPress={openConfirmationModal}
        disabled={!isMachineConfigured}
      >
        Unconfigure Machine
      </Button>
      {isConfirmationModalOpen && (
        <Modal
          content={
            isUnconfiguringMachine ? (
              <Loading>Deleting election data</Loading>
            ) : (
              <Prose textCenter>
                <h1>Delete all election data?</h1>
                <p>
                  This will delete the election configuration and any
                  election-specific data on this machine.
                </p>
              </Prose>
            )
          }
          actions={
            !isUnconfiguringMachine && (
              <React.Fragment>
                <Button onPress={unconfigureMachineAndDelay} danger>
                  Yes, Delete Election Data
                </Button>
                <Button onPress={closeConfirmationModal}>Cancel</Button>
              </React.Fragment>
            )
          }
        />
      )}
    </React.Fragment>
  );
}
