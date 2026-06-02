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

const ProgressBarFill = styled.div<{ color: ProgressBarColor }>`
  background-color: ${(p) => p.theme.colors[p.color]};
  height: 100%;
  transition: 0.3s ease;
  transition-property: background-color, width;
`;

export interface ProgressBarProps {
  color?: ProgressBarColor;
  progress: number;
}

export type ProgressBarColor =
  | 'dangerAccent'
  | 'neutral'
  | 'primary'
  | 'successAccent'
  | 'warningAccent'
  | 'warningContainer';

export function ProgressBar(props: ProgressBarProps): JSX.Element {
  const { color = 'primary', progress } = props;
  assert(progress >= 0 && progress <= 1, 'Progress must be between 0 and 1');
  return (
    <ProgressBarContainer role="progressbar">
      <ProgressBarFill color={color} style={{ width: `${progress * 100}%` }} />
    </ProgressBarContainer>
  );
}
