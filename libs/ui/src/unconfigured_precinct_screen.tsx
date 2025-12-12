import styled from 'styled-components';
import { H1, P } from './typography';
import { Screen } from './screen';
import { Main } from './main';

const CenteredText = styled.div`
  margin: 0 auto;
  text-align: center;
`;

export function UnconfiguredPrecinctScreen(): JSX.Element {
  return (
    <Screen>
      <Main centerChild padded>
        <CenteredText>
          <H1>No Precinct Selected</H1>
          <P>Insert an election manager card to select a precinct.</P>
        </CenteredText>
      </Main>
    </Screen>
  );
}
