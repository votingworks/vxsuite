import { DesktopPalette, H4, H6, Icons } from '@votingworks/ui';
import styled from 'styled-components';

const Container = styled.button`
  width: 40%;
  height: 14rem;
  display: flex;

  flex-direction: column;
  align-items: start;
  border-radius: 0.25rem;

  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.outline};
  background-color: none; //${(p) => p.theme.colors.containerLow};
  background: hsl(262, 10%, 95%);

  padding: 0;
  margin: 0;
  text-align: left;

  justify-content: space-between;

  // &:hover {
  //   background-color: ${DesktopPalette.Purple20};
  // }
`;

const BallotStyleInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;

  gap: 0.25rem;
  padding: 0.5rem;
`;

const PrecinctTitle = styled(H4)`
  margin: 0;
`;

// const CopiesBar = styled.div`
//   flex-shrink: 0;
//   display: flex;
//   flex-direction: row-reverse;
//   align-items: center;
//   justify-content: center;

//   gap: 0.5rem;
//   font-size: 1rem;
//   font-weight: 500;
//   color: ${(p) => p.theme.colors.onBackgroundMuted};

//   padding-bottom: 0.5rem;

//   div {
//     font-size: 1.5rem;
//     font-weight: 700;
//     color: ${(p) => p.theme.colors.onBackground};
//   }
// `;

// const CopiesButton = styled(Button)`
//   background-color: none;
//   border: none;
//   padding: 0;
// `;

const PrintLabel = styled.div`
  flex-shrink: 0;
  display: flex;
  flex-direction: column;

  align-self: center;
  gap: 0.5rem;

  border-top: none; //${(p) => p.theme.sizes.bordersRem.thin}rem solid
  // ${(p) => p.theme.colors.outline};

  // background-color: white;

  font-weight: 700;
  font-size: 1.25rem;

  justify-self: end;
  margin-bottom: 1.5rem;

  text-align: center;
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
  // const [numCopies, setNumCopies] = useState(1);

  return (
    <Container
      onClick={() =>
        console.log(
          `Printing ballot style: ${precinctName}, ${party}, ${language}${
            type ? `, ${type}` : ''
          }`
        )
      }
    >
      <BallotStyleInfo>
        <PrecinctTitle>{precinctName}</PrecinctTitle>
        <H6 />
        {type === 'Absentee' && <H6>Absentee</H6>}
        <H6>{party}</H6>
        <H6 style={{ marginTop: '1.5rem' }}>{language}</H6>
      </BallotStyleInfo>
      {/* <CopiesBar>
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
      </CopiesBar> */}
      <PrintLabel>
        <Icons.Print />
        {/* Print */}
      </PrintLabel>
    </Container>
  );
}
