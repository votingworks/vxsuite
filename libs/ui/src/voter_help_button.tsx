import { Button } from './button.js';
import { appStrings } from './ui_strings/index.js';

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
