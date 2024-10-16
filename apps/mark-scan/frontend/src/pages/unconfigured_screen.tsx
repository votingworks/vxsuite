import {
  Main,
  Screen,
  FullScreenMessage,
  InsertCardImage,
} from '@votingworks/ui';

export function UnconfiguredScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild padded>
        <FullScreenMessage
          title="Insert an election manager card to configure VxMark"
          image={<InsertCardImage cardInsertionDirection="up" />}
        />
      </Main>
    </Screen>
  );
}
