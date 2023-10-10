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

interface StepContainerProps {
  fullWidth?: boolean;
}
export const StepContainer = styled.div<StepContainerProps>`
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 1080px;
  width: ${(p) => (p.fullWidth ? '100%' : undefined)};
`;
