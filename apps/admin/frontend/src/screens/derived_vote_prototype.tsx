import { useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  CheckboxButton,
  H1,
  H2,
  Icons,
  Main,
  Screen,
} from '@votingworks/ui';

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 22rem;
`;

const Row = styled.div`
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
`;

const Heading = styled(H2)`
  font-size: 1rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  margin: 0 0 0.25rem;
`;

const Content = styled.div`
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const NormalCaption = styled.span`
  color: ${(p) => p.theme.colors.onBackground};
  font-size: 0.75rem;
  font-weight: 400;
  margin: 0.25rem 0 0.25rem 0.125rem;
`;

// A: containerLow bg, primary text/icon, primary border
const DeselectedPrimaryButton = styled(Button)`
  background-color: ${(p) => p.theme.colors.containerLow};
  border: 2px solid ${(p) => p.theme.colors.primary};
  color: ${(p) => p.theme.colors.primary};
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;

  svg {
    color: ${(p) => p.theme.colors.primary};
  }
`;

// B: primaryContainer bg, onBackground text/icon, outline border
const PrimaryContainerOutlineButton = styled(Button)`
  background-color: ${(p) => p.theme.colors.primaryContainer};
  border-color: ${(p) => p.theme.colors.outline};
  color: ${(p) => p.theme.colors.onBackground};
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;

  svg {
    color: ${(p) => p.theme.colors.onBackground};
  }
`;

function VariantA({
  label,
  onPromote,
}: {
  label: string;
  onPromote: () => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <DeselectedPrimaryButton
        role="checkbox"
        aria-checked
        fill="outlined"
        color="neutral"
        onPress={onPromote}
        icon={<Icons.Checkbox filled={false} />}
      >
        {label}
      </DeselectedPrimaryButton>
      <NormalCaption>Straight party vote applied: Democrat</NormalCaption>
    </div>
  );
}

function VariantB({
  label,
  onPromote,
}: {
  label: string;
  onPromote: () => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <PrimaryContainerOutlineButton
        role="checkbox"
        aria-checked
        fill="tinted"
        color="primary"
        onPress={onPromote}
        icon={<Icons.Checkbox filled={false} />}
      >
        {label}
      </PrimaryContainerOutlineButton>
      <NormalCaption>Straight party vote applied: Democrat</NormalCaption>
    </div>
  );
}

type Variant = 'A' | 'B';

function DemoOption({
  variant,
  label,
}: {
  variant: Variant;
  label: string;
}): JSX.Element {
  const [promoted, setPromoted] = useState(false);

  if (promoted) {
    return (
      <CheckboxButton
        label={label}
        isChecked
        onChange={() => setPromoted(false)}
      />
    );
  }

  const props = { label, onPromote: () => setPromoted(true) } as const;
  switch (variant) {
    case 'A':
      return <VariantA {...props} />;
    case 'B':
      return <VariantB {...props} />;
    default:
      return <VariantA {...props} />;
  }
}

function ContestDemo({
  variant,
  title,
}: {
  variant: Variant;
  title: string;
}): JSX.Element {
  return (
    <Section>
      <Heading>{title}</Heading>
      <CheckboxButton label="Alice Smith" isChecked onChange={() => {}} />
      <DemoOption variant={variant} label="Bob Jones" />
      <DemoOption variant={variant} label="Carol Davis" />
      <CheckboxButton
        label="Dan Wilson"
        isChecked={false}
        onChange={() => {}}
      />
      <CheckboxButton label="Eve Brown" isChecked={false} onChange={() => {}} />
    </Section>
  );
}

export function DerivedVotePrototype(): JSX.Element {
  return (
    <Screen>
      <Main>
        <Content>
          <H1 style={{ marginBottom: 0 }}>Derived Vote — Final Comparison</H1>
          <p style={{ margin: 0 }}>
            City Council (3 seats). Voter marked Alice Smith and selected
            Democrat straight party. SP fills Bob Jones and Carol Davis. Click a
            derived option to promote it to a real vote.
          </p>

          <Row>
            <ContestDemo
              variant="A"
              title="A — containerLow, primary text+border"
            />
            <ContestDemo
              variant="B"
              title="B — primaryContainer, neutral text+border"
            />
          </Row>
        </Content>
      </Main>
    </Screen>
  );
}
