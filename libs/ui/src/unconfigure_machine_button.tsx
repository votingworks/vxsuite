import React, { useState } from 'react';
import { sleep } from '@votingworks/basics';

import { Button } from './button';
import { Loading } from './loading';
import { Modal } from './modal';
import { Font, H2, P } from './typography';

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
        color="danger"
        icon="Delete"
        onPress={openConfirmationModal}
        disabled={!isMachineConfigured}
      >
        Unconfigure Machine
      </Button>
      {isConfirmationModalOpen && (
        <Modal
          content={
            isUnconfiguringMachine ? (
              <Loading>Unconfiguring Machine</Loading>
            ) : (
              <React.Fragment>
                <H2 as="h1">Unconfigure Machine</H2>
                <P>
                  This will delete the{' '}
                  <Font weight="bold">election configuration</Font> and{' '}
                  <Font weight="bold">any election-specific data</Font> on this
                  machine.
                </P>
              </React.Fragment>
            )
          }
          actions={
            // We intentionally use different language here ("delete election
            // data" instead of "unconfigure machine") to confuse users a tiny
            // bit so they will pause and think
            !isUnconfiguringMachine && (
              <React.Fragment>
                <Button
                  onPress={unconfigureMachineAndDelay}
                  variant="danger"
                  icon="Delete"
                >
                  Delete All Election Data
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
