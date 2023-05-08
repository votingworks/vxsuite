/* stylelint-disable order/properties-order */
import React from 'react';
import { Button, Font, Icons } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Paths } from '../config/globals';

const LabelContainer = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  text-align: left;
`;

export function DisplaySettingsButton(): JSX.Element | null {
  const history = useHistory();

  return (
    <Button onPress={history.push} value={Paths.DISPLAY_SETTINGS}>
      <LabelContainer>
        <Icons.Display />
        <Font weight="semiBold">Color & Size</Font>
      </LabelContainer>
    </Button>
  );
}
