import { Meta } from '@storybook/react';
import { ColorMode } from '@votingworks/types';
import styled, { useTheme } from 'styled-components';
import { useLayoutEffect, useRef, useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import contrastLib from 'get-contrast';
import { H2, H4, Icons } from '..';

function contrastGrade(colorMode: ColorMode, ratio: number): string {
  switch (colorMode) {
    case 'desktop': {
      if (ratio >= 7) {
        return 'AAA (7:1)';
      }
      if (ratio >= 4.5) {
        return 'AA (4.5:1)';
      }
      if (ratio >= 3) {
        return 'Icon (3:1)';
      }
      break;
    }

    case 'print':
    case 'contrastHighLight':
    case 'contrastHighDark': {
      if (ratio >= 20) {
        return 'VVSG High (20:1)';
      }
      break;
    }

    case 'contrastMedium': {
      if (ratio >= 10) {
        return 'VVSG Medium (10:1)';
      }
      break;
    }

    case 'contrastLow': {
      if (ratio >= 4.5 && ratio < 8) {
        return 'VVSG Low (4.5:1 - 8:1)';
      }
      break;
    }

    default: {
      throwIllegalValue(colorMode);
    }
  }
  return 'Inaccessible';
}

function computeContrastRatio(color1: string, color2: string): number {
  const ratio = contrastLib.ratio(color1, color2);
  return Math.floor(ratio * 100) / 100;
}

const Container = styled.div`
  padding: 1rem;
  min-height: 100vh;
  line-height: 1.25;

  h4 {
    margin: 0;
    margin-bottom: 0.2rem;
  }

  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const RoundedRect = styled.div`
  border-radius: 0.5rem;
  padding: 1rem;
`;

const Section = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;

  > :first-child {
    grid-column: span 2;
    margin: 0;
  }
`;

const Accent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

function getEffectiveBackgroundColor(element: HTMLElement): string {
  const { backgroundColor } = getComputedStyle(element);
  if (backgroundColor === 'rgba(0, 0, 0, 0)') {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return getEffectiveBackgroundColor(element.parentElement!);
  }
  return backgroundColor;
}

function ContrastTag(): JSX.Element {
  const { colorMode } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contrastRatio, setContrastRatio] = useState<number>();

  useLayoutEffect(() => {
    if (containerRef.current?.parentElement) {
      const parent = containerRef.current.parentElement;
      const { color } = getComputedStyle(parent);
      const backgroundColor = getEffectiveBackgroundColor(parent);
      const ratio = computeContrastRatio(backgroundColor, color);
      setContrastRatio(ratio);
    }
  }, []);

  const grade = contrastRatio ? contrastGrade(colorMode, contrastRatio) : '';

  return (
    <span ref={containerRef} title={`Ratio: ${contrastRatio}`}>
      {grade === 'Inaccessible' ? '❎' : '✅'} {grade}
    </span>
  );
}

export function ColorThemes(): JSX.Element {
  const { colors, colorMode } = useTheme();

  const outlineIfTouchscreen =
    colorMode !== 'desktop' ? `1px solid ${colors.outline}` : undefined;

  return (
    <Container key={colorMode} style={{ backgroundColor: colors.background }}>
      <Section>
        <H2>Backgrounds</H2>
        <RoundedRect
          style={{
            backgroundColor: colors.background,
            color: colors.onBackground,
            border: `1px solid ${colors.outline}`,
          }}
        >
          <H4>Background</H4>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
          <div style={{ color: colors.primary }}>
            Primary - <ContrastTag />
          </div>
          <div style={{ color: colors.danger }}>
            Danger - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.inverseBackground,
            color: colors.onInverse,
          }}
        >
          <H4>Inverse Background</H4>
          <div style={{ color: colors.onInverse }}>
            On inverse - <ContrastTag />
          </div>
          <div style={{ color: colors.inversePrimary }}>
            Inverse primary - <ContrastTag />
          </div>
        </RoundedRect>
      </Section>

      <Section>
        <H2>Containers</H2>
        <RoundedRect
          style={{
            backgroundColor: colors.container,
            color: colors.onBackground,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Container</H4>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.containerLow,
            color: colors.onBackground,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Container Low</H4>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.containerHigh,
            color: colors.onBackground,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Container High</H4>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.primaryContainer,
            color: colors.onBackground,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Primary Container</H4>
          <div style={{ color: colors.primary }}>
            Primary - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.dangerContainer,
            color: colors.onBackground,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Danger Container</H4>
          <div style={{ color: colors.danger }}>
            Danger - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
          <div>
            <span style={{ color: colors.dangerAccent }}>
              <Icons.Danger />
            </span>{' '}
            Danger Accent -{' '}
            <span style={{ color: colors.dangerAccent }}>
              <ContrastTag />
            </span>
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.warningContainer,
            color: colors.onBackground,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Warning Container</H4>
          <div style={{ color: colors.onBackground }}>
            On background - <ContrastTag />
          </div>
          <div style={{ color: colors.onBackgroundMuted }}>
            On background muted - <ContrastTag />
          </div>
          <div>
            <span style={{ color: colors.warningAccent }}>
              <Icons.Warning />
            </span>{' '}
            Warning Accent -{' '}
            <span style={{ color: colors.warningAccent }}>
              <ContrastTag />
            </span>
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.containerLow,
            color: colors.onBackground,
            gridColumn: 'span 2',
            border: outlineIfTouchscreen,
          }}
        >
          <p>Container Low</p>
          <RoundedRect
            style={{
              backgroundColor: colors.container,
              color: colors.onBackground,
              border: outlineIfTouchscreen,
            }}
          >
            <p>Container</p>
            <RoundedRect
              style={{
                backgroundColor: colors.containerHigh,
                color: colors.onBackground,
                border: outlineIfTouchscreen,
              }}
            >
              <p>Container High</p>
            </RoundedRect>
          </RoundedRect>
        </RoundedRect>
      </Section>

      <Section>
        <H2>Interaction</H2>
        <RoundedRect
          style={{
            backgroundColor: colors.primary,
            color: colors.onPrimary,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Primary</H4>
          <div style={{ color: colors.onPrimary }}>
            On primary - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.neutral,
            color: colors.onNeutral,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Neutral</H4>
          <div style={{ color: colors.onNeutral }}>
            On neutral - <ContrastTag />
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            backgroundColor: colors.danger,
            color: colors.onDanger,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>Danger</H4>
          <div style={{ color: colors.onDanger }}>
            On danger - <ContrastTag />
          </div>
        </RoundedRect>
      </Section>

      <Section>
        <div>
          <H2>Accents</H2>
          {colorMode === 'desktop' && (
            <p>
              These colors have 3:1 contrast with Background and Containers so
              they can be used for icons and other graphical elements, but not
              text.
            </p>
          )}
        </div>
        <RoundedRect
          style={{
            fontWeight: '500',
            border: `1px solid ${colors.outline}`,
          }}
        >
          <H4>On Background</H4>
          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Accent>
              <span style={{ color: colors.successAccent, fontSize: '1.5rem' }}>
                <Icons.Done />
              </span>
              Success Accent
              <span style={{ color: colors.successAccent }}>
                <ContrastTag />
              </span>
            </Accent>
            <Accent>
              <span style={{ color: colors.warningAccent, fontSize: '1.5rem' }}>
                <Icons.Warning />
              </span>
              Warning Accent
              <span style={{ color: colors.warningAccent }}>
                <ContrastTag />
              </span>
            </Accent>
            <Accent>
              <span style={{ color: colors.dangerAccent, fontSize: '1.5rem' }}>
                <Icons.Danger />
              </span>
              Error Accent
              <span style={{ color: colors.dangerAccent }}>
                <ContrastTag />
              </span>
            </Accent>
          </div>
        </RoundedRect>
        <RoundedRect
          style={{
            fontWeight: '500',
            background: colors.containerHigh,
            border: outlineIfTouchscreen,
          }}
        >
          <H4>On Container High</H4>
          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Accent>
              <span style={{ color: colors.successAccent, fontSize: '1.5rem' }}>
                <Icons.Done />
              </span>
              Success Accent
              <span style={{ color: colors.successAccent }}>
                <ContrastTag />
              </span>
            </Accent>
            <Accent>
              <span style={{ color: colors.warningAccent, fontSize: '1.5rem' }}>
                <Icons.Warning />
              </span>
              Warning Accent
              <span style={{ color: colors.warningAccent }}>
                <ContrastTag />
              </span>
            </Accent>
            <Accent>
              <span style={{ color: colors.dangerAccent, fontSize: '1.5rem' }}>
                <Icons.Danger />
              </span>
              Error Accent
              <span style={{ color: colors.dangerAccent }}>
                <ContrastTag />
              </span>
            </Accent>
          </div>
        </RoundedRect>
      </Section>
    </Container>
  );
}

const meta: Meta<typeof ColorThemes> = {
  title: 'Color Themes',
  args: { theme: 'desktop' },
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
