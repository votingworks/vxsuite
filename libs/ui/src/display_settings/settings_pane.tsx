/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';
import { SettingsPaneId } from './types';

export interface SettingsPaneProps {
  children: React.ReactNode;
  id: SettingsPaneId;
}

const Container = styled.div.attrs({ role: 'tabpanel' })`
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0.5rem;
`;

export function SettingsPane(props: SettingsPaneProps): JSX.Element {
  const { children, id } = props;

  return <Container id={id}>{children}</Container>;
}
