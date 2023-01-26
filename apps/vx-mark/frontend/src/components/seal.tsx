import React from 'react';
import styled from 'styled-components';

const sealMaxWidth = '250px';

const SealContainer = styled.div`
  max-width: ${sealMaxWidth};
`;

const SealImage = styled.img`
  max-width: ${sealMaxWidth};
`;

interface Props {
  seal?: string;
  sealUrl?: string;
}

export function Seal({ seal, sealUrl }: Props): JSX.Element {
  return (
    <SealContainer
      aria-hidden
      dangerouslySetInnerHTML={seal ? { __html: seal } : undefined}
    >
      {(!seal && sealUrl && <SealImage alt="state seal" src={sealUrl} />) ||
        undefined}
    </SealContainer>
  );
}
