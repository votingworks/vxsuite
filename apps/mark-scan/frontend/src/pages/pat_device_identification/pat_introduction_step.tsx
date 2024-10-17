import React, { useEffect, useCallback } from 'react';
import { Font, H1, Icons, P, appStrings } from '@votingworks/ui';
import { validKeypressValues } from './constants';
import { PortraitStepInnerContainer } from './portrait_step_inner_container';

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
        onStepCompleted();
      }
    },
    [onStepCompleted]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleInput);

    return () => {
      document.removeEventListener('keydown', handleInput);
    };
  });

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
