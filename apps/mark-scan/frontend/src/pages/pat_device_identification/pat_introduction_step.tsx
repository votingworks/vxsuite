import { useEffect, useCallback } from 'react';
import { H1, Icons, P, Text } from '@votingworks/ui';
import { StepInnerContainer } from '../diagnostic_screen_components';
import { validKeypressValues } from './constants';

export function PatIntroductionStep({
  onStepCompleted,
}: {
  onStepCompleted: () => void;
}): JSX.Element {
  const handleInput = useCallback(
    (event: KeyboardEvent) => {
      if (validKeypressValues.includes(event.key)) {
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
    <StepInnerContainer svgSize="medium" padding="0 40px 0 0">
      <div>
        <Text>
          <H1>Test Your Device</H1>
          <P>This voting machine has two functions for device inputs:</P>
          <P>
            <ol>
              <li>
                Navigate Focus eg. move screen focus between candidates in a
                contest
              </li>
              <li>
                Activate Focus eg. activate the focused candidate&apos;s row to
                mark a vote for them
              </li>
            </ol>
          </P>
          <P>
            The device test will ask you to trigger both device inputs in turn
            to identify their functions. After both inputs are identified you
            will be returned to the previous screen.
          </P>
          <Text bold>
            <P>Trigger any input to continue.</P>
          </Text>
        </Text>
      </div>
      <Icons.Info />
    </StepInnerContainer>
  );
}
