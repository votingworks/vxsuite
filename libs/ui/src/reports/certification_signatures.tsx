import styled from 'styled-components';
import { Font } from '../typography';

const CertificationSignaturesContainer = styled.div`
  margin-top: 1em;

  & > p {
    margin-top: 0;
    margin-bottom: 0.25em;
    font-size: 0.95em;
  }
`;

const Signatures = styled.div`
  display: flex;

  & > div {
    flex: 1;
    margin-top: 2em;
    margin-right: 0.3in;
    border-bottom: 1px solid #000;
    padding-bottom: 1px;

    &::before {
      font-family: 'Noto Emoji', sans-serif;
      font-size: 1em;
      content: '✖️';
    }

    &:last-child {
      margin-right: 0;
    }
  }
`;

export function CertificationSignatures(): JSX.Element {
  return (
    <CertificationSignaturesContainer>
      <p>
        <Font weight="bold">Certification Signatures:</Font> We, the
        undersigned, do hereby certify the election was conducted in accordance
        with the laws of the state.
      </p>
      <Signatures>
        <div />
        <div />
        <div />
      </Signatures>
    </CertificationSignaturesContainer>
  );
}
