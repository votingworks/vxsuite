import { Screen } from './screen';
import { Main } from './main';
import { H1 } from './typography';
import { CardInsertionDirection, RemoveCardImage } from './smart_card_images';

interface Props {
  productName: string;
  cardInsertionDirection?: CardInsertionDirection;
}

export function RemoveCardScreen({
  productName,
  cardInsertionDirection,
}: Props): JSX.Element {
  return (
    <Screen>
      <Main centerChild>
        <RemoveCardImage cardInsertionDirection={cardInsertionDirection} />
        <H1>Remove card to unlock {productName}</H1>
      </Main>
    </Screen>
  );
}
