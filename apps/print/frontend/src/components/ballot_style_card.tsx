import { Button, H4 } from '@votingworks/ui';
import { useState } from 'react';
import styled from 'styled-components';

// drop these near the top of the file
const SHADOW_BASE = '0 6px 10px rgba(0,0,0,.08), 0 12px 28px rgba(0,0,0,.12)';
const SHADOW_HOVER = '0 6px 10px rgba(0,0,0,.10), 0 12px 28px rgba(0,0,0,.16)';

const Container = styled.div`
  width: 100%;
  height: 6rem;
  display: flex;

  border-radius: 0.25rem;
  margin-bottom: 1rem;

  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  background-color: none; // ${(p) => p.theme.colors.containerLow};

  overflow: hidden;

  box-shadow: ${SHADOW_BASE};

  &:hover,
  &:active {
    box-shadow: ${SHADOW_HOVER};
    transform: translateY(0px);
  }
`;

const Row = styled.div`
  display: flex;
  flex-wrap: nowrap;
  height: 3rem;
  align-items: center;
`;

const Tag = styled.div<{ color?: 'red' | 'blue' }>`
  padding: 0.25rem 0.5rem;
  border-top: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-right: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6rem;

  font-weight: 500;
  font-size: 1rem;

  color: ${(p) => {
    if (p.color === 'blue') {
      return '#0015BC'; // #0D47A1'; // Blue text color
    }
    if (p.color === 'red') {
      return '#FF0000'; // '#D71A28'; // Red text color
    }
    return p.theme.colors.onBackground;
  }};

  background-color: ${(p) => p.theme.colors.containerLow};

  &:last-child {
    border-top-right-radius: 0.25rem;
  }
`;

const BallotStyleInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
`;

const PrecinctTitle = styled(H4)`
  margin: 0;
  margin-left: 1rem;
`;

const PrintButton = styled(Button)`
  width: 6rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-self: center;
  padding: 1rem;
  height: 100%;

  border-radius: 0;
  border-left: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};

  font-weight: 700;
  font-size: 1.25rem;
`;

const CopiesBar = styled.div`
  width: 2.25rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  font-size: 1rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.onBackgroundMuted};

  div {
    font-size: 1.25rem;
    font-weight: 700;
    color: ${(p) => p.theme.colors.onBackground};
  }
`;

const CopiesButton = styled(Button)`
  background-color: none;
  border: none;
  padding: 0;
`;

export function BallotStyleCard({
  precinctName,
  party,
  language,
  type,
}: {
  precinctName: string;
  party: string;
  language: string;
  type?: string;
}): JSX.Element {
  const [numCopies, setNumCopies] = useState(1);

  // Determine color based on party
  function getPartyColor(partyName: string): 'red' | 'blue' | undefined {
    const lowerParty = partyName.toLowerCase();
    if (lowerParty.includes('dem')) {
      return 'blue';
    }
    if (lowerParty.includes('rep')) {
      return 'red';
    }
    return undefined;
  }

  return (
    <Container>
      <BallotStyleInfo>
        <Row>
          <PrecinctTitle>{precinctName}</PrecinctTitle>
        </Row>
        <Row>
          {type && <Tag>{type}</Tag>}
          <Tag color={!type ? getPartyColor(party) : undefined}>{party}</Tag>
          <Tag>{language}</Tag>
        </Row>
      </BallotStyleInfo>
      <CopiesBar>
        <CopiesButton
          color="neutral"
          onPress={() => setNumCopies((prev) => prev + 1)}
        >
          +
        </CopiesButton>
        <div>{numCopies}</div>
        <CopiesButton
          onPress={() => setNumCopies((prev) => (prev > 1 ? prev - 1 : 1))}
        >
          –
        </CopiesButton>
      </CopiesBar>
      <PrintButton
        color="primary"
        onPress={() => console.log('Print')}
        fill="tinted"
        icon="Print"
      >
        Print
      </PrintButton>
    </Container>
  );
}
