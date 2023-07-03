import React, { useState } from 'react';
import styled from 'styled-components';

import { MarkThresholds } from '@votingworks/types';
import { Button, H6, Modal, P } from '@votingworks/ui';

import { assert, throwIllegalValue } from '@votingworks/basics';
import { Loading } from './loading';
import { TextInput } from './text_input';
import { setMarkThresholdOverrides } from '../api';

export interface Props {
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

const Inputs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
}: Props): JSX.Element {
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
      setMarkThresholdOverridesMutation.mutate(
        {
          markThresholdOverrides: {
            definite: definiteFloat,
            marginal: marginalFloat,
          },
        },
        {
          onSuccess: onClose,
        }
      );
    } catch (error) {
      assert(error instanceof Error);
      setCurrentState(ModalState.ERROR);
      setErrorMessage(`Error setting thresholds: ${error.message}`);
    }
  }

  function resetThresholds() {
    setCurrentState(ModalState.SAVING);
    setMarkThresholdOverridesMutation.mutate({});
    onClose();
  }

  switch (currentState) {
    case ModalState.SAVING:
      return <Modal content={<Loading />} onOverlayClick={onClose} />;
    case ModalState.ERROR:
      return (
        <Modal
          title="Error"
          content={<P>{errorMessage}</P>}
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    case ModalState.CONFIRM_INTENT:
      return (
        <Modal
          title="Override Mark Thresholds"
          content={
            <P>
              WARNING: Do not proceed unless you have been instructed to do so
              by a member of VotingWorks staff. Changing mark thresholds will
              impact the performance of your scanner.
            </P>
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
          title="Override Mark Thresholds"
          content={
            <Inputs>
              {/* This eslint rule is failing to detect `TextInput` as an `input` element. */}
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label>
                <H6 as="h2">Definite:</H6>
                <TextInput
                  data-testid="definite-text-input"
                  value={definiteThreshold}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDefiniteThreshold(e.target.value)
                  }
                />
              </label>
              {/* This eslint rule is failing to detect `TextInput` as an `input` element. */}
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label>
                <H6 as="h2">Marginal:</H6>
                <TextInput
                  data-testid="marginal-text-input"
                  value={marginalThreshold}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setMarginalThreshold(e.target.value)
                  }
                />
              </label>
            </Inputs>
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
          title="Reset Mark Thresholds"
          content={
            <React.Fragment>
              <P>Reset thresholds to the election defaults?</P>
              <ThresholdColumns>
                <div>
                  <H6 as="h2">Current Thresholds</H6>
                  <P>
                    Definite: {markThresholdOverrides.definite}
                    <br />
                    Marginal: {markThresholdOverrides.marginal}
                  </P>
                </div>
                <div>
                  <H6 as="h2">Default Thresholds</H6>
                  <P>
                    Definite: {defaultMarkThresholds.definite}
                    <br />
                    Marginal: {defaultMarkThresholds.marginal}
                  </P>
                </div>
              </ThresholdColumns>
            </React.Fragment>
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
