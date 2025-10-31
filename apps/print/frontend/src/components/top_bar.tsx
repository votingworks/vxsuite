import { H1, MainHeader } from '@votingworks/ui';
import styled from 'styled-components';

export const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
`;

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  height: 4rem;
`;

export function TopBar({ title }: { title: string }): JSX.Element | null {
  return (
    <Header>
      <div>{title && <H1>{title}</H1>}</div>
    </Header>
  );
}
