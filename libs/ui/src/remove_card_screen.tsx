import styled from 'styled-components';
import { Screen } from './screen';
import { Main } from './main';
import { H1 } from './typography';

const RemoveCardImage = styled.img`
  margin: 0;
  height: 22vw;
`;

interface Props {
  productName: string;
}

export function RemoveCardScreen({ productName }: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <RemoveCardImage aria-hidden src="/assets/remove-card.svg" alt="" />
        <H1>Remove card to unlock {productName}</H1>
      </Main>
    </Screen>
  );
}
