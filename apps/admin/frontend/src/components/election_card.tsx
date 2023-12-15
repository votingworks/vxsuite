import { Election } from '@votingworks/types';
import { Card, H2, P, Seal } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import styled from 'styled-components';

const Container = styled(Card).attrs({ color: 'neutral' })`
  margin: 1rem 0;

  > div {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 1rem;
  }
`;

/**
 * Presents basic election information in a card.
 */
export function ElectionCard({
  election,
}: {
  election: Election;
}): JSX.Element {
  return (
    <Container>
      <Seal seal={election.seal} maxWidth="7rem" />
      <div>
        <H2 as="h3">{election.title}</H2>
        <P>
          {election.county.name}, {election.state}
          <br />
          {format.localeDate(new Date(election.date))}
        </P>
      </div>
    </Container>
  );
}
