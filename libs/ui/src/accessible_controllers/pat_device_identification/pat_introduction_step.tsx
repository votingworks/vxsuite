import React, { useEffect, useCallback } from 'react';

import { Font, H1, P } from '../../typography.js';
import { Icons } from '../../icons.js';
import { appStrings } from '../../ui_strings/index.js';
import { validKeypressValues } from './constants.js';
import { PortraitStepInnerContainer } from './portrait_step_inner_container.js';

export function PatIntroductionStep({
  isDiagnostic,
  onStepCompleted,
}: {
  isDiagnostic?: boolean;
  onStepCompleted: () => void;
}): JSX.Element {
  const handleInput = useCallback(
    (event: KeyboardEvent) => {
      if (validKeypressValues.includes(event.key)) {
        event.preventDefault();
        // Stop other listeners (e.g., app-level PAT handlers) from also handling this event
        event.stopImmediatePropagation();
        onStepCompleted();
      }
    },
    [onStepCompleted]
  );

  useEffect(() => {
    // Use capture phase so this handler runs BEFORE app-level handlers,
    // allowing stopImmediatePropagation to prevent them from firing
    document.addEventListener('keydown', handleInput, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleInput, { capture: true });
    };
  }, [handleInput]);

  return (
    <PortraitStepInnerContainer>
      <Icons.Info />
      <H1>
        {isDiagnostic
          ? 'Connect PAT Device'
          : appStrings.titleBmdPatCalibrationIntroStep()}
      </H1>
      <P>
        {isDiagnostic ? (
          <React.Fragment>
            The two inputs can be used to <Font weight="bold">Move</Font> focus
            on the screen or <Font weight="bold">Select</Font> an item.
          </React.Fragment>
        ) : (
          appStrings.noteBmdPatCalibrationIntroStep()
        )}
      </P>
      <Font weight="bold">
        <P>{appStrings.instructionsBmdPatCalibrationIntroStep()}</P>
      </Font>
    </PortraitStepInnerContainer>
  );
}
