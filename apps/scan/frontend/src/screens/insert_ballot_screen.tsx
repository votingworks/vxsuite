import { InsertBallotImage, P, appStrings } from '@votingworks/ui';
import { Screen } from '../components/layout.js';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout.js';

interface Props {
  isTestMode: boolean;
}

export function InsertBallotScreen({ isTestMode }: Props): JSX.Element {
  return (
    <Screen
      centerContent
      voterFacing
      showTestModeBanner={isTestMode}
      // Don't read aloud "Insert your ballot" to ensure that prior "Your ballot was counted" audio
      // is not interrupted
      disableReadOnLoad
    >
      <FullScreenPromptLayout
        title={appStrings.titleScannerInsertBallotScreen()}
        image={<InsertBallotImage ballotFeedLocation="top" />}
      >
        <P>{appStrings.instructionsScannerInsertBallotScreen()}</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}
