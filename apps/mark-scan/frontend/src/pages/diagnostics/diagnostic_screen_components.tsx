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

export const PatStepContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 1080px;
  width: 100%;
`;

export const StepContainer = styled.div`
  padding: 1rem;
  margin-top: 2rem;
  display: flex;
  flex-direction: column;

  svg {
    align-self: center;
    width: 24em;
  }

  button {
    margin-top: 2rem;
  }
`;

export const CancelButtonContainer = styled.div`
  margin: 1rem;
  margin-top: 5rem;
  align-self: center;
`;
