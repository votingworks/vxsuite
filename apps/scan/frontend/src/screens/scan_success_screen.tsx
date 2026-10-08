import { FullScreenIconWrapper, Icons, P, appStrings } from '@votingworks/ui';

import { Screen } from '../components/layout.js';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout.js';

interface Props {
  isTestMode: boolean;
}

export function ScanSuccessScreen({ isTestMode }: Props): JSX.Element {
  return (
    <Screen centerContent voterFacing showTestModeBanner={isTestMode}>
      <FullScreenPromptLayout
        title={appStrings.titleScannerSuccessScreen()}
        image={
          <FullScreenIconWrapper>
            <Icons.Done color="success" />
          </FullScreenIconWrapper>
        }
      >
        <P>{appStrings.noteThankYouForVoting()}</P>
      </FullScreenPromptLayout>
    </Screen>
  );
}
