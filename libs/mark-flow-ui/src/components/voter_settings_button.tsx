import { Button, appStrings } from '@votingworks/ui';

export interface VoterSettingsButtonProps {
  onPress: () => void;
}

export function VoterSettingsButton(
  props: VoterSettingsButtonProps
): JSX.Element {
  const { onPress } = props;

  return (
    <Button icon="Display" onPress={onPress}>
      {appStrings.buttonVoterSettings()}
    </Button>
  );
}
