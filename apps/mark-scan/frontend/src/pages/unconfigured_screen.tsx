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
          title="Insert an Election Manager card to configure VxMarkScan"
          image={<InsertCardImage />}
        />
      </Main>
    </Screen>
  );
}
