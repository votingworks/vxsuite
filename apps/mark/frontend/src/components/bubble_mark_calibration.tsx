/* istanbul ignore file - temporary dev/demo component @preserve */

import React from 'react';
import styled from 'styled-components';

import { PrintCalibration } from '@votingworks/mark-backend';
import { Button, buttonStyles, Font } from '@votingworks/ui';

import * as api from '../api';

const Container = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0 0.5rem;
`;

const Controls = styled.div`
  > input {
    ${buttonStyles} /* Hack to match button height and border styling */
    border-left: 0;
    border-radius: 0;
    border-right: 0;
    width: 5.5rem;
  }

  > button:first-child {
    border-bottom-right-radius: 0;
    border-top-right-radius: 0;
  }

  > button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
`;

interface BubbleMarkCalibrationProps {
  field: keyof PrintCalibration;
  label?: string;
}

const DELTA_MM = 0.5;

export function BubbleMarkCalibration(
  props: BubbleMarkCalibrationProps
): React.ReactNode {
  const { field, label } = props;

  const printCalibration = api.getPrintCalibration.useQuery().data;
  const setPrintCalibration = api.setPrintCalibration.useMutation().mutate;

  if (!printCalibration) return null;

  const valMinus: PrintCalibration = {
    ...printCalibration,
    [field]: printCalibration[field] - DELTA_MM,
  };
  const valPlus: PrintCalibration = {
    ...printCalibration,
    [field]: printCalibration[field] + DELTA_MM,
  };

  return (
    <Container>
      <Font weight="bold">{label}:</Font>
      <Controls>
        <Button onPress={setPrintCalibration} value={valMinus}>
          &minus;
        </Button>
        <input value={`${printCalibration[field].toFixed(1)} mm`} />
        <Button onPress={setPrintCalibration} value={valPlus}>
          +
        </Button>
      </Controls>
    </Container>
  );
}
