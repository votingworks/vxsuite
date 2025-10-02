import { assert } from '@votingworks/basics';
import styled from 'styled-components';

const ProgressBarContainer = styled.div`
  background-color: ${(p) => p.theme.colors.containerLow};
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  height: 0.75rem;
  width: 100%;
  overflow: hidden;
`;

const ProgressBarFill = styled.div`
  background-color: ${(p) => p.theme.colors.primary};
  height: 100%;
  transition: width 0.3s ease;
`;

export function ProgressBar({ progress }: { progress: number }): JSX.Element {
  assert(progress >= 0 && progress <= 1, 'Progress must be between 0 and 1');
  return (
    <ProgressBarContainer>
      <ProgressBarFill style={{ width: `${progress * 100}%` }} />
    </ProgressBarContainer>
  );
}
