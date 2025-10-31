import { Button, H1, MainHeader } from '@votingworks/ui';
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
  width: 100%;
`;

const PrintAllButton = styled(Button)`
  width: 12rem;
  // margin-right: auto;
  padding-left: 1rem;
`;

export function TopBar({ title }: { title: string }): JSX.Element | null {
  return (
    <Header>
      <div>{title && <H1>{title}</H1>}</div>
      {title === 'Print' && (
        <PrintAllButton
          color="neutral"
          fill="outlined"
          onPress={() => console.log('Print all ballot styles')}
        >
          Print All Ballot Styles
        </PrintAllButton>
      )}
    </Header>
  );
}
