import React from 'react';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { QuestionCircle } from '../components/graphics';

export function UnconfiguredPrecinctScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <QuestionCircle />
      <CenteredLargeProse>
        <h1>No Precinct Selected</h1>
        <p>Insert an Election Manager card to select a precinct.</p>
      </CenteredLargeProse>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredPrecinctScreen />;
}
