import React from 'react';
import styled from 'styled-components';
import { DisplaySettingsManagerContext } from './display_settings_manager_context';
import { Button } from './button';
import { appStrings } from './ui_strings';
import { H2 } from './typography';
import { useScreenInfo } from './hooks/use_screen_info';
import { Header } from './display_settings/header';

const Overlay = styled.div`
  position: fixed;
  height: 100%;
  width: 100%;
  z-index: 1000;
  left: 0;
  top: 0;
  background: #fff;
  padding: 1em;
`;

const ButtonContainer = styled.div`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
`;

export function VisualModeDisabledOverlay(): JSX.Element {
  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );
  const screenInfo = useScreenInfo();
  return (
    <Overlay aria-hidden>
      <Header portrait={screenInfo.isPortrait}>
        <H2 as="h1">{appStrings.titleAudioOnlyModeEnabled()}</H2>
      </Header>
      <ButtonContainer>
        <Button
          variant="primary"
          onPress={() => {
            displaySettingsManager.setIsVisualModeDisabled(false);
          }}
        >
          {appStrings.buttonExitAudioOnlyMode()}
        </Button>
      </ButtonContainer>
    </Overlay>
  );
}
