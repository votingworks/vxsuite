import { H1, MainHeader } from '@votingworks/ui';
import styled from 'styled-components';

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
`;

const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  height: 4rem;
`;

export function TitleBar({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}): JSX.Element | null {
  return (
    <Header>
      <H1>{title}</H1>
      {actions && <ButtonRow as="div">{actions}</ButtonRow>}
    </Header>
  );
}
