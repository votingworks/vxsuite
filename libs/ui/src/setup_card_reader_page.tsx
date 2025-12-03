import { ERROR_SCREEN_MESSAGES } from './error_boundary';
import { Main } from './main';
import { Screen } from './screen';
import { Caption, H1, P } from './typography';

export function SetupCardReaderPage(): JSX.Element {
  return (
    <Screen>
      <Main centerChild padded>
        <H1 align="center">Card Reader Not Detected</H1>
        <P align="center">{ERROR_SCREEN_MESSAGES.RESTART}</P>
        <Caption align="center">{ERROR_SCREEN_MESSAGES.REACH_OUT}</Caption>
      </Main>
    </Screen>
  );
}
