import { Main, Screen, CenteredLargeProse, H1 } from '@votingworks/ui';

/**
 * LoginPromptScreen prompts the user to log in when the machine is unconfigured
 * @returns JSX.Element
 */
export function LoginPromptScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <CenteredLargeProse>
          <H1>Insert Election Manager card to configure VxScan</H1>
        </CenteredLargeProse>
      </Main>
    </Screen>
  );
}
