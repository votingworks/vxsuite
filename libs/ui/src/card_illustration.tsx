import styled from 'styled-components';
import { SmartCardChipImage } from './smart_card_images';

const CardIllustrationContainer = styled.div<{
  inserted?: boolean;
  active?: boolean;
}>`
  height: 100%;
  padding: 1rem;
  background: ${(p) => p.theme.colors.containerLow};

  > div {
    width: 20rem;
    border-radius: 1.5rem;
    background: ${(p) => p.inserted && p.theme.colors.background};
    border-width: ${(p) =>
      p.active
        ? p.theme.sizes.bordersRem.medium
        : p.theme.sizes.bordersRem.thin}rem;
    border-style: ${(p) => (p.inserted ? 'solid' : 'dashed')};
    border-color: ${(p) =>
      p.active ? p.theme.colors.primary : p.theme.colors.outline};
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: ${(p) => (p.inserted ? 'space-between' : 'center')};
    padding: ${(p) => (p.inserted ? '5rem 2rem 3rem 2rem' : '2rem')};
    flex-direction: column;
    gap: 1rem;
  }
`;

const SmartCardChipImageContainer = styled.div`
  margin-right: 3rem;

  svg {
    width: 3.5rem;
    background: ${(p) => p.theme.colors.containerLow};
  }
`;

export function CardIllustration({
  inserted,
  active,
  children,
}: {
  inserted: boolean;
  active?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <CardIllustrationContainer inserted={inserted} active={active}>
      <div>
        {children}
        {inserted && (
          <SmartCardChipImageContainer>
            <SmartCardChipImage />
          </SmartCardChipImageContainer>
        )}
      </div>
    </CardIllustrationContainer>
  );
}
