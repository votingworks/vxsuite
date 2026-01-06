import styled from 'styled-components';
import { H1 } from '@votingworks/ui';
import { Header, NavScreen } from '../nav_screen';

const SupportHeader = styled(Header)`
  background-color: ${(p) => p.theme.colors.warningContainer};
`;

export function SupportHomeScreen(): React.ReactNode {
  return (
    <NavScreen>
      <SupportHeader>
        <H1>Support Tools</H1>
      </SupportHeader>
    </NavScreen>
  );
}
