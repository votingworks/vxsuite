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
      <P>
        Your device&apos;s two inputs can be used to <b>Move</b> focus between
        two items on the screen and <b>Select</b> an item.
      </P>
      <Text bold>
        <P>Trigger any input to continue.</P>
      </Text>
    </PortraitStepInnerContainer>
  );
}
