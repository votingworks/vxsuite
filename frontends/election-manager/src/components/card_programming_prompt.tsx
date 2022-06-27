import React from 'react';
import styled from 'styled-components';

const InsertCardImage = styled.img`
  height: 20vw;
`;

interface CardProgrammingPromptProps {
  cardType: 'election' | 'superAdmin';
}

export function CardProgrammingPrompt({
  cardType,
}: CardProgrammingPromptProps): JSX.Element {
  return (
    <React.Fragment>
      <h2>{cardType === 'election' ? 'Election' : 'Super Admin'} Cards</h2>
      <InsertCardImage src="/assets/insert-card-no-margins.svg" alt="" />
      <p>
        Insert a card to view card details or to create{' '}
        {cardType === 'election' ? (
          <React.Fragment>
            an <strong>Admin or Poll Worker</strong> card for this election
          </React.Fragment>
        ) : (
          <React.Fragment>
            a <strong>Super Admin</strong> card
          </React.Fragment>
        )}
        .
      </p>
    </React.Fragment>
  );
}
