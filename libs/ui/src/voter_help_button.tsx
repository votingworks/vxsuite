import { Button } from './button';
import { appStrings } from './ui_strings';

export function VoterHelpButton({
  disabled,
  onPress,
}: {
  disabled?: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Button disabled={disabled} icon="Question" onPress={onPress}>
      {appStrings.buttonHelp()}
    </Button>
  );
}
