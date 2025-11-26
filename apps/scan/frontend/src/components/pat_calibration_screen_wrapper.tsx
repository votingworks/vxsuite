import React from 'react';
import styled from 'styled-components';
import { Main, Screen, WithScrollButtons } from '@votingworks/ui';

/**
 * Wrapper to override PAT calibration styles for VxScan's landscape layout.
 * The PAT calibration components were designed for portrait mode (VxMarkScan)
 * so we need to adjust some styles for landscape display.
 *
 * Note: We use margin: auto on the inner content instead of justify-content: center
 * to prevent the top from being cut off when content overflows. With justify-content: center,
 * overflow content gets clipped equally on both sides, but margin: auto only applies
 * when there's extra space, allowing scroll to start from the top.
 */
const LandscapePatCalibrationContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: auto 0;
  width: 100%;

  /* Make the icons smaller to save space */
  svg {
    height: 5em;
  }

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

const SideBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  border-left: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  justify-content: center;
  max-width: 30%;
`;

const Body = styled(Main)`
  flex: 1;
`;

/**
 * Adapts VxScan's Screen component to the interface expected by PatDeviceCalibrationPage.
 * Uses a horizontal landscape layout with action buttons in a sidebar on the right,
 * similar to VxMark's VoterScreen layout pattern.
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
    <Screen flexDirection="row">
      <Body centerChild={centerContent} flexColumn padded>
        <WithScrollButtons focusable>
          <LandscapePatCalibrationContainer>
            {children}
          </LandscapePatCalibrationContainer>
        </WithScrollButtons>
      </Body>
      {actionButtons && <SideBar>{actionButtons}</SideBar>}
    </Screen>
  );
}
