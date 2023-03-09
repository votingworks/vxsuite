import React from 'react';
import styled from 'styled-components';
import { Font, H1, Icons, P, Section } from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';

export function UnconfiguredPrecinctScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <Section horizontalAlign="center">
        <H1>No Precinct Selected</H1>
        <P>Insert an Election Manager card to select a precinct.</P>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPrecinctScreen />;
}
