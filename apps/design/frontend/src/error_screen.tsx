import {
  AppLogo,
  FullScreenIconWrapper,
  H1,
  Icons,
  LeftNav,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import { Column, Row } from './layout';
import { isAuthError } from './api';

export function ErrorScreen({ error }: { error: unknown }): JSX.Element | null {
  let errorMessage = 'Something went wrong';
  if (isAuthError(error)) {
    switch (error.message) {
      case 'auth:unauthorized': {
        window.location.replace('/auth/login');
        return null;
      }
      case 'auth:forbidden': {
        errorMessage = 'Page not found';
        break;
      }
      default: {
        throwIllegalValue(error.message);
      }
    }
  }

  return (
    <Row style={{ flex: 1, width: '100%' }}>
      <LeftNav style={{ width: '14rem' }}>
        <a href="/">
          <AppLogo appName="VxDesign" />
        </a>
      </LeftNav>
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
        <H1>{errorMessage}</H1>
      </Column>
    </Row>
  );
}
