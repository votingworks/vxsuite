import { Card, H1, Icons, MainHeader } from '@votingworks/ui';
import styled from 'styled-components';
import { getElectionRecord, getTestMode } from '../api';

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
`;

const Header = styled(MainHeader)`
  display: grid;
  grid-template-columns: minmax(350px, auto) auto 1fr;
  align-items: center;
  gap: 0.5rem;
  min-height: 4rem;
  padding: 0.5rem 1rem;
  box-sizing: border-box;
`;

const RightSection = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
`;

const BannerSection = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

// TODO: Factor out shared desktop-friendly test mode banner component with central-scan
const TestModeCallout = styled(Card).attrs({ color: 'warning' })`
  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};

  > div {
    padding: 0.5rem 1rem;
  }

  flex-shrink: 0;
`;

export function TitleBar({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}): JSX.Element | null {
  const electionRecordQuery = getElectionRecord.useQuery();
  const testModeQuery = getTestMode.useQuery();

  const isTestMode = testModeQuery.data ?? false;
  const isConfigured = electionRecordQuery.data !== null;

  return (
    <Header>
      <H1>{title}</H1>
      <BannerSection>
        {isTestMode && isConfigured && (
          <TestModeCallout>
            <Icons.Warning color="warning" /> Test Ballot Mode
          </TestModeCallout>
        )}
      </BannerSection>
      <RightSection>
        {actions && <ButtonRow as="div">{actions}</ButtonRow>}
      </RightSection>
    </Header>
  );
}
