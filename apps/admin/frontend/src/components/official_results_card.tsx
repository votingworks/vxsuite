import { Card } from '@votingworks/ui';
import styled from 'styled-components';

export const OfficialResultsCard = styled(Card).attrs({ color: 'neutral' })`
  margin-bottom: 1rem;

  h3 {
    margin: 0;

    svg {
      margin-right: 0.5rem;
    }
  }

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
`;
