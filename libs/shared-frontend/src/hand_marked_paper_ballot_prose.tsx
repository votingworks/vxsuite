import styled from 'styled-components';

import { Prose, ProseProps } from './prose';

interface Props extends ProseProps {
  density?: number;
}

export const HandMarkedPaperBallotProse = styled(Prose)<Props>`
  line-height: ${({ density }) => (density !== 0 ? '1.1' : '1.3')};
  & h3,
  & h4,
  & h5,
  & p,
  & hr {
    margin-top: ${({ compact, density }) =>
      compact
        ? '0'
        : density === 2
        ? '0.25em'
        : density === 1
        ? '0.5em'
        : '1em'};
    margin-bottom: ${({ compact, density }) =>
      compact
        ? '0'
        : density === 2
        ? '0.25em'
        : density === 1
        ? '0.5em'
        : '1em'};
  }
  & h3 + p,
  & h4 + p,
  & h5 + p {
    margin-top: ${({ compact, density }) =>
      compact
        ? 0
        : density === 2
        ? '-0.5em'
        : density === 1
        ? '-0.75em'
        : '-1em'};
  }
  & hr {
    border: 0;
    border-top: 0.1em solid #000000;
  }
`;
