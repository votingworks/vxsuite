import styled from 'styled-components';
import { Font } from '../typography';
import { Box } from './layout';

const CertificationSignaturesContainer = styled(Box)`
  margin-top: 1em;

  & > p {
    margin-top: 0;
    margin-bottom: 0.25em;
  }
`;

const SignatureLines = styled.div`
  display: flex;
  gap: 0.3in;
`;

const SignatureLine = styled.div`
  flex: 1;
  margin-top: 2em;
  border-bottom: 1px solid #000;
`;

const SvgContainer = styled.div`
  width: 1.2em;
  height: 1.2em;
  margin-left: 2px;

  svg {
    width: 100%;
    height: 100%;
  }
`;

function SignatureX(): JSX.Element {
  return (
    <SvgContainer>
      <svg
        width="50"
        height="40"
        viewBox="0 0 50 40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          id="forwardslash"
          width="10"
          height="48"
          x="15"
          y="-4"
          transform="rotate(-45 20 20)"
          fill="#000000"
        />
        <rect
          id="backslash"
          width="10"
          height="48"
          x="15"
          y="-4"
          transform="rotate(45 20 20)"
          fill="black"
        />
      </svg>
    </SvgContainer>
  );
}

export function CertificationSignatures(): JSX.Element {
  return (
    <CertificationSignaturesContainer>
      <p>
        <Font weight="bold">Certification Signatures:</Font> We, the
        undersigned, do hereby certify the election was conducted in accordance
        with the laws of the state.
      </p>
      <SignatureLines>
        <SignatureLine>
          <SignatureX />
        </SignatureLine>
        <SignatureLine>
          <SignatureX />
        </SignatureLine>
        <SignatureLine>
          <SignatureX />
        </SignatureLine>
      </SignatureLines>
    </CertificationSignaturesContainer>
  );
}
