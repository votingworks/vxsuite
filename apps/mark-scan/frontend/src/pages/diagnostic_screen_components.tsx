import { Prose } from '@votingworks/ui';
import styled from 'styled-components';

export const DiagnosticScreenHeader = styled(Prose).attrs({
  maxWidth: false,
})`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  padding: 40px;
`;

export const StepContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 1080px;
`;

interface StepInnerContainerProps {
  svgSize?: 'large' | 'medium';
  padding?: string;
}
export const StepInnerContainer = styled.div<StepInnerContainerProps>`
  display: flex;
  width: 100%;
  padding: ${(p) => p.padding ?? undefined};

  & > div {
    flex: 1;
    padding: 0 20px 0 40px;
  }

  svg {
    height: 25em;
    height: ${(p) => {
      switch (p.svgSize) {
        case 'large':
          return '25em';
        case 'medium':
          return '8em';
        default:
          return '25em';
      }
    }};
  }

  button {
    margin-top: 4em;
  }

  ol {
    margin-top: 0;
    padding-left: 1em;

    li {
      margin-bottom: 1em;
    }
  }
`;
