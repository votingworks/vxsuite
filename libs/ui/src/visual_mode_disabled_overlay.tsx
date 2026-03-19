import React from 'react';
import styled from 'styled-components';
import { VoterSettingsManagerContext } from './voter_settings_manager_context.js';
import { Button } from './button.js';
import { appStrings } from './ui_strings/index.js';
import { H2 } from './typography.js';
import { useScreenInfo } from './hooks/use_screen_info.js';
import { Header } from './voter_settings/header.js';
import { useCurrentTheme } from './hooks/use_current_theme.js';

const Overlay = styled.div`
  position: fixed;
  height: 100%;
  width: 100%;
  z-index: 1000;
  left: 0;
  top: 0;
  background: #fff;
`;

const ButtonContainer = styled.div`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
`;

export function VisualModeDisabledOverlay(): JSX.Element | null {
  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const screenInfo = useScreenInfo();
  const currentTheme = useCurrentTheme();

  if (!currentTheme.isVisualModeDisabled) {
    return null;
  }

  return (
    <Overlay aria-hidden>
      <Header portrait={screenInfo.isPortrait}>
        <H2 style={{ margin: 0 }}>{appStrings.titleAudioOnlyModeEnabled()}</H2>
      </Header>
      <ButtonContainer>
        <Button
          icon="Eye"
          variant="primary"
          onPress={() => {
            voterSettingsManager.setIsVisualModeDisabled(false);
          }}
        >
          {appStrings.buttonExitAudioOnlyMode()}
        </Button>
      </ButtonContainer>
    </Overlay>
  );
}
