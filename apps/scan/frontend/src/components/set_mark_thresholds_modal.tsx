import React, { useState } from 'react';
import styled from 'styled-components';

import { MarkThresholds } from '@votingworks/types';
import { Button, Caption, H1, Loading, Modal, P, Prose } from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { setMarkThresholdOverrides } from '../api';

export interface SetMarkThresholdsModalProps {
  onClose: () => void;
  markThresholds?: MarkThresholds;
  markThresholdOverrides?: MarkThresholds;
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
}: SetMarkThresholdsModalProps): JSX.Element {
  const setMarkThresholdOverridesMutation =
    setMarkThresholdOverrides.useMutation();
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

  function overrideThresholds(definite: string, marginal: string) {
    setCurrentState(ModalState.SAVING);
    // eslint-disable-next-line vx/gts-safe-number-parse
    const definiteFloat = parseFloat(definite);
    if (Number.isNaN(definiteFloat) || definiteFloat > 1) {
      setCurrentState(ModalState.ERROR);
      setErrorMessage(
        `Inputted definite threshold invalid: ${definite}. Please enter a number from 0 to 1.`
      );
      return;
    }
    // eslint-disable-next-line vx/gts-safe-number-parse
    const marginalFloat = parseFloat(marginal);
    if (Number.isNaN(marginalFloat) || marginalFloat > 1) {
      setCurrentState(ModalState.ERROR);
      setErrorMessage(
        `Inputted marginal threshold invalid: ${marginal}. Please enter a number from 0 to 1.`
      );
      return;
    }
    setMarkThresholdOverridesMutation.mutate(
      {
        markThresholdOverrides: {
          definite: definiteFloat,
          marginal: marginalFloat,
        },
      },
      { onSuccess: onClose }
    );
  }

  function resetThresholds() {
    setCurrentState(ModalState.SAVING);
    setMarkThresholdOverridesMutation.mutate(
      { markThresholdOverrides: undefined },
      { onSuccess: onClose }
    );
  }

  switch (currentState) {
    case ModalState.SAVING:
      return <Modal content={<Loading />} onOverlayClick={onClose} />;
    case ModalState.ERROR:
      return (
        <Modal
          content={
            <Prose>
              <H1>Error</H1>
              <P>{errorMessage}</P>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    case ModalState.CONFIRM_INTENT:
      return (
        <Modal
          content={
            <Prose>
              <H1>Override Mark Thresholds</H1>
              <P>
                WARNING: Do not proceed unless you have been instructed to do so
                by a member of VotingWorks staff. Changing mark thresholds will
                impact the performance of your scanner.
              </P>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {
                <Button
                  variant="danger"
                  onPress={setCurrentState}
                  value={ModalState.SET_THRESHOLDS}
                >
                  Proceed to Override Thresholds
                </Button>
              }{' '}
              <Button onPress={onClose}>Close</Button>
            </React.Fragment>
          }
        />
      );
    case ModalState.SET_THRESHOLDS:
      return (
        <Modal
          content={
            <Prose>
              <H1>Override Mark Thresholds</H1>
              <P>Definite:</P>
              <input
                type="number"
                step=".005"
                data-testid="definite-text-input"
                value={definiteThreshold}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDefiniteThreshold(e.target.value)
                }
              />
              <P>Marginal:</P>
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
                variant="danger"
                onPress={() =>
                  overrideThresholds(definiteThreshold, marginalThreshold)
                }
              >
                Override Thresholds
              </Button>{' '}
              <Button onPress={onClose}>Close</Button>
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
              <H1>Reset Mark Thresholds</H1>
              <P>Reset thresholds to the election defaults?</P>
              <ThresholdColumns>
                <div>
                  Current Thresholds
                  <P>
                    <Caption>
                      Definite: {markThresholdOverrides.definite}
                      <br />
                      Marginal: {markThresholdOverrides.marginal}
                    </Caption>
                  </P>
                </div>
                <div>
                  Default Thresholds
                  <Caption>
                    Definite: {defaultMarkThresholds.definite}
                    <br />
                    Marginal: {defaultMarkThresholds.marginal}
                  </Caption>
                </div>
              </ThresholdColumns>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={resetThresholds}>
                Reset Thresholds
              </Button>{' '}
              <Button onPress={onClose}>Close</Button>
            </React.Fragment>
          }
        />
      );
    default:
      throwIllegalValue(currentState);
  }
}
