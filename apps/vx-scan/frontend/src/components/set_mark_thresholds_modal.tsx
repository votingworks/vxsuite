import React, { useState } from 'react';
import styled from 'styled-components';

import { MarkThresholds } from '@votingworks/types';
import {
  Button,
  LinkButton,
  Loading,
  Modal,
  Prose,
  Text,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/utils';

export interface Props {
  onClose: () => void;
  markThresholds?: MarkThresholds;
  markThresholdOverrides?: MarkThresholds;
  setMarkThresholdOverrides: (markThresholds?: MarkThresholds) => Promise<void>;
}

const ThresholdColumns = styled.div`
  display: flex;
  flex-direction: row;
  > div {
    flex: 1;
  }
`;

enum ModalState {
  SAVING = 'saving',
  RESET_THRESHOLDS = 'reset_thresholds',
  SET_THRESHOLDS = 'set_thresholds',
  CONFIRM_INTENT = 'confirm_intent',
  ERROR = 'error',
}

export const DefaultMarkThresholds: Readonly<MarkThresholds> = {
  marginal: 0.17,
  definite: 0.25,
};

export function SetMarkThresholdsModal({
  onClose,
  markThresholds,
  markThresholdOverrides,
  setMarkThresholdOverrides,
}: Props): JSX.Element {
  const [currentState, setCurrentState] = useState<ModalState>(
    markThresholdOverrides === undefined
      ? ModalState.CONFIRM_INTENT
      : ModalState.RESET_THRESHOLDS
  );

  const [errorMessage, setErrorMessage] = useState('');
  const defaultMarkThresholds = markThresholds ?? DefaultMarkThresholds;
  const defaultDefiniteThreshold = defaultMarkThresholds.definite;
  const defaultMarginalThreshold = defaultMarkThresholds.marginal;

  const [definiteThreshold, setDefiniteThreshold] = useState(
    defaultDefiniteThreshold.toString()
  );
  const [marginalThreshold, setMarginalThreshold] = useState(
    defaultMarginalThreshold.toString()
  );

  async function overrideThresholds(definite: string, marginal: string) {
    setCurrentState(ModalState.SAVING);
    try {
      // eslint-disable-next-line vx/gts-safe-number-parse
      const definiteFloat = parseFloat(definite);
      if (Number.isNaN(definiteFloat) || definiteFloat > 1) {
        throw new Error(
          `Inputted definite threshold invalid: ${definite}. Please enter a number from 0 to 1.`
        );
      }
      // eslint-disable-next-line vx/gts-safe-number-parse
      const marginalFloat = parseFloat(marginal);
      if (Number.isNaN(marginalFloat) || marginalFloat > 1) {
        throw new Error(
          `Inputted marginal threshold invalid: ${marginal}. Please enter a number from 0 to 1.`
        );
      }
      await setMarkThresholdOverrides({
        definite: definiteFloat,
        marginal: marginalFloat,
      });
      onClose();
    } catch (error) {
      assert(error instanceof Error);
      setCurrentState(ModalState.ERROR);
      setErrorMessage(`Error setting thresholds: ${error.message}`);
    }
  }

  async function resetThresholds() {
    setCurrentState(ModalState.SAVING);
    try {
      await setMarkThresholdOverrides(undefined);
      onClose();
    } catch (error) {
      assert(error instanceof Error);
      setCurrentState(ModalState.ERROR);
      setErrorMessage(`Error setting thresholds: ${error.message}`);
    }
  }

  switch (currentState) {
    case ModalState.SAVING:
      return <Modal content={<Loading />} onOverlayClick={onClose} />;
    case ModalState.ERROR:
      return (
        <Modal
          content={
            <Prose>
              <h1>Error</h1>
              <p>{errorMessage}</p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<LinkButton onPress={onClose}>Close</LinkButton>}
        />
      );
    case ModalState.CONFIRM_INTENT:
      return (
        <Modal
          content={
            <Prose>
              <h1>Override Mark Thresholds</h1>
              <p>
                WARNING: Do not proceed unless you have been instructed to do so
                by a member of VotingWorks staff. Changing mark thresholds will
                impact the performance of your scanner.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {
                <Button
                  danger
                  onPress={() => setCurrentState(ModalState.SET_THRESHOLDS)}
                >
                  Proceed to Override Thresholds
                </Button>
              }{' '}
              <LinkButton onPress={onClose}>Close</LinkButton>
            </React.Fragment>
          }
        />
      );
    case ModalState.SET_THRESHOLDS:
      return (
        <Modal
          content={
            <Prose>
              <h1>Override Mark Thresholds</h1>
              <Text>Definite:</Text>
              <input
                type="number"
                step=".005"
                data-testid="definite-text-input"
                value={definiteThreshold}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDefiniteThreshold(e.target.value)
                }
              />
              <Text>Marginal:</Text>
              <input
                type="number"
                step=".005"
                data-testid="marginal-text-input"
                value={marginalThreshold}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMarginalThreshold(e.target.value)
                }
              />
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={() =>
                  overrideThresholds(definiteThreshold, marginalThreshold)
                }
              >
                Override Thresholds
              </Button>{' '}
              <LinkButton onPress={onClose}>Close</LinkButton>
            </React.Fragment>
          }
        />
      );
    case ModalState.RESET_THRESHOLDS:
      assert(markThresholdOverrides);
      return (
        <Modal
          content={
            <Prose>
              <h1>Reset Mark Thresholds</h1>
              <p>Reset thresholds to the election defaults?</p>
              <ThresholdColumns>
                <div>
                  Current Thresholds
                  <Text small>
                    Definite: {markThresholdOverrides.definite}
                    <br />
                    Marginal: {markThresholdOverrides.marginal}
                  </Text>
                </div>
                <div>
                  Default Thresholds
                  <Text small>
                    Definite: {defaultMarkThresholds.definite}
                    <br />
                    Marginal: {defaultMarkThresholds.marginal}
                  </Text>
                </div>
              </ThresholdColumns>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={resetThresholds}>
                Reset Thresholds
              </Button>{' '}
              <LinkButton onPress={onClose}>Close</LinkButton>
            </React.Fragment>
          }
        />
      );
    default:
      throwIllegalValue(currentState);
  }
}
