import { Caption, FullScreenIconWrapper, Icons, P } from '@votingworks/ui';
import { Screen } from '../components/layout';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';

export function ScanBusyScreen(): JSX.Element {
  return (
    <Screen centerContent>
      <FullScreenPromptLayout
        title="Remove Your Ballot"
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>Another ballot is being scanned.</P>
        <Caption>Ask a poll worker if you need help.</Caption>
      </FullScreenPromptLayout>
    </Screen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen />;
}
