import { Icons, Button } from '@votingworks/ui';
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${(p) => p.theme.colors.warningContainer};
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-bottom: 0;
  border-radius: 0.5rem 0.5rem 0 0;
  color: ${(p) => p.theme.colors.neutral};
  font-weight: 500;
  padding: 0.25rem 0.5rem;

  button {
    gap: 0.25rem;
  }
`;

const IconTextContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export function MarginalMarkFlag({
  onDismissFlag,
}: {
  onDismissFlag: () => void;
}): JSX.Element {
  return (
    <Container>
      <IconTextContainer>
        <Icons.Warning color="warning" />
        Review marginal mark
      </IconTextContainer>
      <Button
        aria-label="Dismiss"
        icon="X"
        fill="transparent"
        onPress={onDismissFlag}
        style={{ padding: '0' }}
        value={undefined}
        tabIndex={-1}
      >
        Dismiss
      </Button>
    </Container>
  );
}
