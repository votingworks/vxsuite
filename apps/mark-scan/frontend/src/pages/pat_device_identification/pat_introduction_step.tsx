import { useEffect, useCallback } from 'react';
import { H1, Icons, P, Text } from '@votingworks/ui';
import { validKeypressValues } from './constants';
import { PortraitStepInnerContainer } from './portrait_step_inner_container';

export function PatIntroductionStep({
  onStepCompleted,
}: {
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
      <H1>Test Your Device</H1>
      <P>This voting machine has two functions for device inputs:</P>
      <P>
        <ol>
          <li>
            Navigate Focus eg. move screen focus between candidates in a contest
          </li>
          <li>
            Activate Focus eg. activate the focused candidate&apos;s row to mark
            a vote for them
          </li>
        </ol>
      </P>
      <P>
        The device test will ask you to trigger both device inputs in turn to
        identify their functions. After both inputs are identified you will be
        returned to the previous screen.
      </P>
      <Text bold>
        <P>Trigger any input to continue.</P>
      </Text>
    </PortraitStepInnerContainer>
  );
}
