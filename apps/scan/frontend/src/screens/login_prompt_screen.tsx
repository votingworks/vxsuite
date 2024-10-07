import {
  Screen,
  InsertCardImage,
  Main,
  FullScreenMessage,
} from '@votingworks/ui';

/**
 * LoginPromptScreen prompts the user to log in when the machine is unconfigured
 * @returns JSX.Element
 */
export function LoginPromptScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <FullScreenMessage
          title="Insert an election manager card to configure VxScan"
          image={<InsertCardImage />}
        />
      </Main>
    </Screen>
  );
}
