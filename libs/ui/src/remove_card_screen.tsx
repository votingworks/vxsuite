import styled from 'styled-components';
import { Screen } from './screen';
import { Main } from './main';
import { H1, P } from './typography';

const RemoveCardImage = styled.img`
  margin: 0 auto -1rem;
  height: 30vw;
`;

interface Props {
  productName: string;
}

export function RemoveCardScreen({ productName }: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <RemoveCardImage aria-hidden src="/assets/remove-card.svg" alt="" />
        <H1>{productName} Unlocked</H1>
        <P>Remove card to continue.</P>
      </Main>
    </Screen>
  );
}
