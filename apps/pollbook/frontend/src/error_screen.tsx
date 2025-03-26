import { FullScreenIconWrapper, H1, Icons } from '@votingworks/ui';
import { Column, Row } from './layout';

export function ErrorScreen(): JSX.Element {
  return (
    <Row style={{ flex: 1, width: '100%' }}>
      <Column
        style={{
          flex: 1,
          padding: '1rem',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FullScreenIconWrapper>
          <Icons.Danger />
        </FullScreenIconWrapper>
        <H1>Something went wrong</H1>
      </Column>
    </Row>
  );
}
