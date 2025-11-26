import React from 'react';
import styled from 'styled-components';
import { Screen } from './layout';

/**
 * Wrapper to override PAT calibration styles for VxScan's landscape layout.
 * The PAT calibration components were designed for portrait mode (VxMarkScan)
 * so we need to adjust some styles for landscape display.
 */
const LandscapePatCalibrationContainer = styled.div`
  /* Make the icons smaller to save space */
  svg {
    height: 4em;
  }

  width: 100%;

  > div {
    width: 100%;
    padding: 10px;
  }

  /* Reduce padding for landscape */
  h1 {
    margin: 0.25em 0 !important;
    font-size: 1em !important;
  }

  h3 {
    font-size: 1em !important;
  }

  p {
    margin: 0.25em 0 !important;
  }
`;

/**
 * Adapts VxScan's Screen component to the interface expected by PatDeviceCalibrationPage.
 * Uses landscape-friendly styling.
 */
export function PatCalibrationScreenWrapper({
  children,
  centerContent,
  actionButtons,
  // hideMenuButtons is required by PatDeviceCalibrationPage interface but not used in VxScan
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hideMenuButtons,
}: {
  children: React.ReactNode;
  centerContent?: boolean;
  hideMenuButtons?: boolean;
  actionButtons?: React.ReactNode;
}): JSX.Element {
  return (
    <Screen
      centerContent={centerContent}
      actionButtons={actionButtons}
      voterFacing
      showTestModeBanner={false}
    >
      <LandscapePatCalibrationContainer>
        {children}
      </LandscapePatCalibrationContainer>
    </Screen>
  );
}
