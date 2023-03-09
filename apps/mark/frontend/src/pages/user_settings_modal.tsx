import React, { useContext, useEffect } from 'react';
import styled from 'styled-components';

import {
  Button,
  Prose,
  Modal,
  UiThemeManagerContext,
  TextSizeSelector,
  ColorModeSelector,
} from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';
import { handleGamepadKeyboardEvent } from '../lib/gamepad';
import { DEFAULT_USER_SETTINGS } from '../config/globals';

const SettingsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
`;

export function VoterSettingsModal(): JSX.Element {
  const { userSettings, setUserSettings } = useContext(BallotContext);
  const { setColorMode, setSizeMode } = useContext(UiThemeManagerContext);

  function closeUserSettingsModal() {
    return setUserSettings({ showSettingsModal: false });
  }

  function resetUserSettingsToDefaults() {
    setUserSettings(DEFAULT_USER_SETTINGS);
    setColorMode('contrastMedium');
    setSizeMode('m');
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        event.stopPropagation();
        handleGamepadKeyboardEvent({ ...event, key: 'ArrowDown' });
      }
      if (event.key === 'ArrowLeft') {
        event.stopPropagation();
        handleGamepadKeyboardEvent({ ...event, key: 'ArrowUp' });
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  return (
    <Modal
      content={
        <Prose textCenter maxWidth={false} id="modalaudiofocus">
          <h1>Voter Settings</h1>
          <span aria-label="Navigate through the settings using the up and down buttons. Use the select button to select a setting. When you are done, use the right or left arrow to close settings." />
          <SettingsContainer>
            <TextSizeSelector />
            <ColorModeSelector />
          </SettingsContainer>
        </Prose>
      }
      actions={
        <React.Fragment>
          <Button
            onPress={closeUserSettingsModal}
            aria-label="Close Settings"
            variant="done"
          >
            Done
          </Button>
          <Button onPress={resetUserSettingsToDefaults}>
            Use default settings
          </Button>
        </React.Fragment>
      }
    />
  );
}
