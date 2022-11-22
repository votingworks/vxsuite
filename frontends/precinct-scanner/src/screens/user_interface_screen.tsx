// import { FONT_SIZES } from '@votingworks/ui';
import React, { useContext } from 'react';
import styled, { ThemeProvider } from 'styled-components';
// import tinycolor from 'tinycolor2';
import { ExclamationTriangle } from '../components/graphics';
import { ContrastSetting, TextSizeSetting } from '../config/types';
import { AppContext } from '../contexts/app_context';

interface Dictionary<T> {
  [key: string | number]: T;
}

// 1920 x 1080 FHD
// Elo 13" (E683595) 11.57" x 6.5"  166ppi (165.946413137424373)
// Elo 15" (E155645) 13.55" x 7.62" 142ppi (141.697416974169742)

const screen: {
  [key: string]: number;
} = {
  // widthInches: 6.5,
  // heightInches: 11.57,
  widthInches: 7.62,
  heightInches: 13.55,
};

const screenInchPx = Math.round(
  Math.hypot(window.screen.width, window.screen.height) /
    Math.hypot(screen['heightInches'], screen['widthInches'])
);

function fontSize(points: number): number {
  return Math.round((screenInchPx / 72) * points * 1.4); // 1.4 is a magic number to increase the font-size such that they letter "I" is the specified height in points.
}

function inchesToPixels(inches: number): number {
  return Math.round(screenInchPx * inches);
}

const Screen = styled.div`
  height: 100%;
  overflow: auto;
  background: ${({ theme }) => theme.contrast.background};
  color: ${({ theme }) => theme.contrast.foreground};
  user-select: text;
  font-size: ${({ theme }) => fontSize(theme.size.text)}px;
  line-height: 1;
`;

const PseudoScreen = styled(Screen)<{ show?: boolean }>`
  height: auto;
  display: ${({ show }) => (show ? 'flex' : 'none')};
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
`;

const Nav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  background: ${({ theme }) => theme.contrast.background};
  color: ${({ theme }) => theme.contrast.foreground};
  padding: ${inchesToPixels(0.07)}px;
  border-bottom: 2px solid;
`;

const Slide = styled.div<{ center?: boolean }>`
  display: ${({ center }) => (center ? 'flex' : undefined)};
  flex-direction: column;
  justify-content: center;
  min-height: 100%;
  padding: ${inchesToPixels(0.15)}px;
  border-bottom: 2px solid;
`;

const ComparisonGrid = styled.span`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-column-gap: 10px;
  grid-row-gap: 10px;
  & > button {
    border-width: 1px;
  }
`;

const OneInchPpiBox = styled.div`
  display: inline-block;
  width: ${screenInchPx}px;
  height: ${screenInchPx}px;
  background: tan;
  &:after {
    display: block;
    content: '${screenInchPx}px (1 physical inch on screen)';
    padding: 1em;
    font-size: 50%;
  }
`;

const TwentyFourPointBox = styled.div`
  width: ${Math.round((screenInchPx / 72) * 24)}px;
  height: ${Math.round((screenInchPx / 72) * 24)}px;
  background: orange;
  &:after {
    content: '(I) 24pt';
    white-space: nowrap;
    font-size: ${Math.round((screenInchPx / 72) * 24)}px;
  }
`;

const TwentyFourPointBoxAdjusted = styled.div`
  position: relative;
  width: ${Math.round((screenInchPx / 72) * 24)}px;
  height: ${Math.round((screenInchPx / 72) * 24)}px;
  background: orange;
  &:after {
    position: absolute;
    top: -10px;
    display: block;
    white-space: nowrap;
    content: '(I) 24pt * 1.4';
    font-size: ${fontSize(24)}px;
    line-height: 1;
  }
`;

const OneInchBox = styled.div`
  width: 1in;
  height: 1in;
  background: teal;
  &:after {
    content: '1in';
    font-size: 50%;
  }
`;

const EightPointFiveMmBox = styled.div`
  width: 8.5mm;
  height: 8.5mm;
  background: tomato;
  &:after {
    content: '8.5mm';
    font-size: 50%;
  }
`;

const vvsgMinMm = [3.5, 4.8, 6.4, 8.5];
const vvsgMinP = [10, 14, 18, 24];

// const Heading = styled.h1``;
// const prose = (
//   <React.Fragment>
//     {['h1', 'h2', 'h3', 'h4', 'h5'].map((h) => (
//       <Heading key={h} as={h}>{`${h} heading`}</Heading>
//     ))}
//     <p>text font size</p>
//   </React.Fragment>
// );

interface SizeTheme {
  readonly text: number; // points
  readonly h1: number;
  readonly h2: number;
  readonly h3: number;
  readonly h4: number;
}

const sizeThemes: Dictionary<SizeTheme> = {
  S: {
    text: 10,
    h1: 1.35,
    h2: 1.15,
    h3: 1,
    h4: 0.8,
  },
  M: {
    text: 14,
    h1: 1.2,
    h2: 1.1,
    h3: 1,
    h4: 0.8,
  },
  L: {
    text: 18,
    h1: 1.2,
    h2: 1.1,
    h3: 1,
    h4: 0.8,
  },
  XL: {
    text: 24,
    h1: 1.2,
    h2: 1.1,
    h3: 1,
    h4: 0.8,
  },
};
const sizeThemeKeys = Object.keys(sizeThemes) as TextSizeSetting[];
const fontSizeMinPx = `${fontSize(sizeThemes['S']['text'])}px`;

interface ContrastTheme {
  foreground: string;
  background: string;
  button?: {
    foreground?: string;
    background: string;
  };
  buttonPrimary?: {
    foreground?: string;
    background: string;
  };
  warning?: {
    foreground?: string;
    background: string;
  };
}

const contrastThemes: Dictionary<ContrastTheme> = {
  default: {
    foreground: 'black',
    background: 'white',
    button: {
      background: 'gainsboro',
    },
    buttonPrimary: {
      background: 'lime',
      foreground: 'black',
    },
    warning: {
      foreground: 'orange',
      background: 'black',
    },
  },
  black: {
    foreground: 'black',
    background: 'white',
  },
  white: {
    foreground: 'white',
    background: 'black',
  },
  grey: {
    foreground: 'white',
    background: 'dimgrey',
  },
};
const contrastThemeKeys = Object.keys(contrastThemes) as ContrastSetting[];

const Prose = styled.div<{ scale?: number; center?: boolean; right?: boolean }>`
  text-align: ${({ center, right }) =>
    (center && 'center') || (right && 'right')};
  line-height: 1.4;
  h1 {
    margin: 1em 0 0;
    font-size: ${({ theme, scale = 1 }) => theme.size.h1 * scale}em;
  }
  h2 {
    margin: 1em 0 0;
    font-size: ${({ theme, scale = 1 }) => theme.size.h2 * scale}em;
  }
  h3 {
    margin: 1em 0 0;
    font-size: ${({ theme, scale = 1 }) => theme.size.h3 * scale}em;
  }
  h4 {
    margin: 1em 0 0;
    font-size: ${({ theme, scale = 1 }) =>
      `clamp(${fontSizeMinPx}, ${theme.size.h4 * scale}em, ${
        theme.size.h4 * scale
      }em);`};
  }
  p {
    margin: 0 0 1em;
    font-size: ${({ scale = 1 }) => scale}em;
  }
  & > :not(.ignore-prose):first-child {
    margin-top: 0;
  }
  & > :not(.ignore-prose):last-child {
    margin-bottom: 0;
  }
`;

export interface ButtonInterface
  extends React.PropsWithoutRef<JSX.IntrinsicElements['button']> {
  readonly primary?: boolean;
  readonly large?: boolean;
  readonly small?: boolean;
}

const Button = styled.button.attrs(({ type = 'button' }) => ({
  type,
}))<ButtonInterface>`
  appearance: none;
  display: inline-block;
  margin: 0;
  padding: ${({ large = false, small = false }) =>
    `${small ? '2px 24px' : large ? '10px 36px' : '5px 30px'}`};
  border: 4px solid ${({ theme }) => theme.contrast.foreground};
  border-radius: ${screenInchPx}px;
  box-sizing: border-box;
  font-size: ${({ large = false, small = false }) =>
    small
      ? `clamp(${fontSizeMinPx}, 0.9em, 0.9em);`
      : large
      ? `1.2em`
      : 'inherit'};
  // font-weight: ${({ primary }) => (primary ? '700' : undefined)};
  line-height: 1;
  min-height: ${({ large = false, small = false }) =>
    small
      ? Math.round(screenInchPx * 0.5) // VVSG Requirement 7.2-I - Touch area size
      : large
      ? Math.round(screenInchPx * 0.9)
      : Math.round(screenInchPx * 0.7)}px;
  min-width: ${({ large = false, small = false }) =>
    small
      ? Math.round(screenInchPx * 0.5) // VVSG Requirement 7.2-I - Touch area size
      : large
      ? Math.round(screenInchPx * 0.9)
      : Math.round(screenInchPx * 0.7)}px;
  background: ${({ primary, theme }) =>
    primary
      ? theme.contrast?.buttonPrimary?.background || theme.contrast.foreground
      : theme.contrast?.button?.background || theme.contrast.background};
  color: ${({ primary, theme }) =>
    primary
      ? theme.contrast?.buttonPrimary?.foreground || theme.contrast.background
      : theme.contrast?.button?.foreground || theme.contrast.foreground};
  // &:focus {
  //   outline: 12px dashed ${({ theme }) => theme.contrast.foreground};;
  //   outline-offset: 4px;
  //   z-index: 100;
  // }
`;

const SegmentedButton = styled.span`
  display: flex;
  white-space: nowrap;
  & > button:first-child {
    box-shadow: none;
  }
  & > button:not(:last-child) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  & > button:not(:first-child) {
    margin-left: -4px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  & > button:disabled {
    background: #028099;
    color: #ffffff;
  }
`;

const FontSizeSegmentedButton = styled(SegmentedButton)`
  button {
    min-width: ${fontSize(sizeThemes['S']['text'] * 4)}px;
    &[data-size='S'] {
      font-size: ${fontSize(sizeThemes['S']['text'])}px;
      line-height: 0px;
    }
    &[data-size='M'] {
      font-size: ${fontSize(sizeThemes['M']['text'])}px;
      line-height: 0px;
    }
    &[data-size='L'] {
      font-size: ${fontSize(sizeThemes['L']['text'])}px;
      line-height: 0px;
    }
    &[data-size='XL'] {
      font-size: ${fontSize(sizeThemes['XL']['text'])}px;
      line-height: 0px;
    }
  }
`;

const ContrastSegmentedButton = styled(SegmentedButton)`
  span:not(:focus):not(:active) {
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }
  button {
    &::before {
      content: 'A';
      display: block;
      width: 44px;
      height: 44px;
      box-sizing: border-box;
      border-radius: 100px;
      line-height: 40px;
      font-weight: 700;
      // box-sizing: content-box;
    }
    &[data-contrast='default'] {
      &::before {
        background: lime;
        color: black;
        border: 2px solid black;
      }
      // &[data-selected='true'] {
      //   &::before {
      //     border-color: black;
      //   }
      // }
    }
    &[data-contrast='black'] {
      &::before {
        background: white;
        color: black;
        border: 2px solid black;
      }
    }
    &[data-contrast='white'] {
      &::before {
        background: black;
        color: white;
        border: 2px solid white;
      }
    }
    &[data-contrast='grey'] {
      &::before {
        background: grey;
        color: white;
        border: 2px solid white;
      }
    }
  }
`;

const ResponsiveButtonParagraph = styled.p`
  @media (orientation: portrait) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5em;
    & > button {
      flex: 1 auto;
      padding-right: 0.25em;
      padding-left: 0.25em;
    }
  }
`;

const GraphicWarning = styled.div`
  text-align: center;
  margin: 15px auto;
  padding: 25px;
  font-size: 2em;
  font-weight: bold;
  border: 15px solid
    ${({ theme }) =>
      theme.contrast?.warning?.foreground || theme.contrast.foreground};
  border-radius: 20px;
  outline: 4px solid
    ${({ theme }) =>
      theme.contrast?.warning?.background || theme.contrast.foreground};
  background: ${({ theme }) =>
    theme.contrast?.warning?.background || theme.contrast.background};
  color: ${({ theme }) =>
    theme.contrast?.warning?.foreground || theme.contrast.foreground};
`;

export function UserInterfaceScreen(): JSX.Element {
  const { userSettings, setUserSettings } = useContext(AppContext);
  return (
    <React.Fragment>
      <ThemeProvider
        theme={{
          size: sizeThemes['S'],
          contrast: contrastThemes[userSettings.contrastTheme],
          inchesToPixels,
        }}
      >
        <PseudoScreen>
          <Button small>Smjall</Button>
          <Button>Defaylt</Button>
          <Button large>Large</Button>
        </PseudoScreen>
      </ThemeProvider>
      <ThemeProvider
        theme={{
          size: sizeThemes['M'],
          contrast: contrastThemes[userSettings.contrastTheme],
        }}
      >
        <PseudoScreen>
          <Button small>Smjall</Button>
          <Button>Defaylt</Button>
          <Button large>Large</Button>
        </PseudoScreen>
      </ThemeProvider>
      <ThemeProvider
        theme={{
          size: sizeThemes['L'],
          contrast: contrastThemes[userSettings.contrastTheme],
        }}
      >
        <PseudoScreen>
          <Button small>Smjall</Button>
          <Button>Defaylt</Button>
          <Button large>Large</Button>
        </PseudoScreen>
      </ThemeProvider>
      <ThemeProvider
        theme={{
          size: sizeThemes['XL'],
          contrast: contrastThemes[userSettings.contrastTheme],
        }}
      >
        <PseudoScreen>
          <Button small>Smjall</Button>
          <Button>Defaylt</Button>
          <Button large>Large</Button>
        </PseudoScreen>
      </ThemeProvider>
      <ThemeProvider
        theme={{
          size: sizeThemes[userSettings.sizeTheme],
          contrast: contrastThemes[userSettings.contrastTheme],
        }}
      >
        <Nav>
          <FontSizeSegmentedButton>
            {sizeThemeKeys.map((size) => (
              <Button
                key={size}
                data-size={size}
                small
                onClick={() => setUserSettings({ sizeTheme: size })}
                primary={userSettings.sizeTheme === size}
              >
                A
              </Button>
            ))}
          </FontSizeSegmentedButton>
          <ContrastSegmentedButton>
            {contrastThemeKeys.map((contrast) => (
              <Button
                key={contrast}
                data-contrast={contrast}
                small
                onClick={() => setUserSettings({ contrastTheme: contrast })}
                primary={userSettings.contrastTheme === contrast}
                data-selected={userSettings.contrastTheme === contrast}
              >
                <span>{contrast}</span>
              </Button>
            ))}
          </ContrastSegmentedButton>
        </Nav>
        <Screen>
          <Slide center>
            <GraphicWarning>Warning</GraphicWarning>
            <ExclamationTriangle />
            <Prose center>
              <h1>Review Your Ballot</h1>
              <p>No votes were found when scanning this ballot. </p>
              <ResponsiveButtonParagraph>
                <Button primary>Return Ballot</Button> or{' '}
                <Button>Cast Ballot As&nbsp;Is</Button>
              </ResponsiveButtonParagraph>
              <p>
                <small>
                  <em>
                    Your votes will count, even if you leave some blank.
                    <br />
                    Ask a poll worker if you need help.
                  </em>
                </small>
              </p>
            </Prose>
          </Slide>
          <Slide>
            <Prose>
              <h1>
                Heading 1 adsf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf
                asdf{' '}
              </h1>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
              <h2>Heading 2</h2>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
              <h3>Heading 3</h3>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
              <h4>Heading 4</h4>
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
            </Prose>
          </Slide>
          <Slide>
            <Prose>
              <h1>Questions</h1>
              <h2>Default Text Size</h2>
              <p>
                Of the four sizes, the second smallest is specified as the
                default. Can we default to one of the larger text sizes? The
                user would then be able adjust to smaller text size if they
                wish. Use case: Voter using Ballot Scanner.
              </p>
              <h2>Default Text Size</h2>
              <p>
                The VVSG Text Size Discussion section mentions “The sizes are
                minimums” …thus, can we use a text scale that is larger for each
                of the four sizes?
              </p>
              <h2>Contrast & Colors</h2>
              <p>
                The color contrast scale is from 0 to 21. It is a logarythmic
                scale such that 10:1 is not visually “in the middle” of the
                scale. Thus a 10:1 contrast ratio is so close to 20:1 that there
                is not much room for visual difference. Here are examples of the
                two extremes (
                <a href="https://contrast-ratio.com/#%23424242-on-white">
                  Grey (75%) on White
                </a>{' '}
                and{' '}
                <a href="https://contrast-ratio.com/#%23b3b3b3-on-black">
                  Grey (30%) on Black
                </a>
                ) next to black on white in the middle. Given that there is not
                much difference, is there any value in offereing a 10:1 contrast
                theme vs just starting with a high-contrast theme?
              </p>
              <p>
                <ComparisonGrid>
                  <Button
                    small
                    style={{ color: '#424242', background: 'white' }}
                  >
                    Grey (75%) on White (10:1)
                  </Button>{' '}
                  <Button
                    small
                    style={{ color: 'white', background: '#424242' }}
                  >
                    White on Grey (75%) (10:1)
                  </Button>
                  <Button small style={{ color: 'black', background: 'white' }}>
                    black on White (21:1)
                  </Button>{' '}
                  <Button small style={{ color: 'white', background: 'black' }}>
                    White on Black (21:1)
                  </Button>
                  <Button
                    small
                    style={{ color: 'black', background: '#b3b3b3' }}
                  >
                    Black on Grey (30%) (10:1)
                  </Button>
                  <Button
                    small
                    style={{ color: '#b3b3b3', background: 'black' }}
                  >
                    Grey (30%) on Black (10:1)
                  </Button>
                </ComparisonGrid>
                <br />
                <p>Here are some colors which have a high contrast ratio.</p>
                <ComparisonGrid>
                  <Button
                    small
                    style={{ color: 'white', background: '#890500' }}
                  >
                    White on Red (10:1)
                  </Button>
                  <Button
                    small
                    style={{ color: 'white', background: '#004e10' }}
                  >
                    White on Green (10:1)
                  </Button>
                  <Button
                    small
                    style={{ color: 'white', background: '#0000e2' }}
                  >
                    White on Blue (10:1)
                  </Button>
                  <Button
                    small
                    style={{ color: 'black', background: 'orange' }}
                  >
                    Black on Orange (10:1)
                  </Button>
                  <Button
                    small
                    style={{ color: 'white', background: '#72137a' }}
                  >
                    white on Purple (10:1)
                  </Button>
                  <Button
                    small
                    style={{ color: 'black', background: 'yellow' }}
                  >
                    Black on Yellow (19.5:1)
                  </Button>
                </ComparisonGrid>
                <br />
                <p>
                  When a green button is placed with a white button, it is so
                  dark it may as well be black.
                </p>
                <ComparisonGrid>
                  <Button
                    small
                    style={{
                      color: 'white',
                      background: '#004e10',
                      borderColor: '#004e10',
                    }}
                  >
                    White on Green (10:1)
                  </Button>
                  <Button small style={{ color: 'black', background: 'white' }}>
                    black on White (21:1)
                  </Button>{' '}
                </ComparisonGrid>
              </p>
              <h2>Percieved contrast</h2>
              <p>
                Black on Red vs White on Red…
                <ComparisonGrid>
                  <Button small style={{ color: 'white', background: 'red' }}>
                    White on Red (3.99:1)
                  </Button>
                  <Button small style={{ color: 'black', background: 'red' }}>
                    Black on Red (5.25:1)
                  </Button>
                </ComparisonGrid>
              </p>
              <p>
                Other factors affect readability: font-weight, font-size, etc.{' '}
                <a href="https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html">
                  WC3 Addresses how contrast minimums can vary when type is
                  larger or has higher weight.
                </a>
              </p>
              <p>What type of user is the low contrast mode for?</p>
              <p>Use of color: border,</p>
              <p>
                Can we have additional contrast options that are what we want?
              </p>
            </Prose>
          </Slide>
          <Slide>
            <h1>VVSG Min using Points, Adjusted to pixels</h1>
            {vvsgMinP.map((size) => (
              <div key={size} style={{ fontSize: `${fontSize(size)}px` }}>
                Letter I in font size: {size}pt
              </div>
            ))}
            <ol style={{ listStyle: 'lower-alpha' }}>
              <li>3.5-4.2 mm (10-12 points)</li>
              <li>4.8-5.6 mm (14-16 points)</li>
              <li>6.4-7.1 mm (18-20 points)</li>
              <li>8.5-9.0 mm (24-25 points)</li>
            </ol>
          </Slide>
          <Slide>
            <h1>7.1-G – Text size (electronic display)</h1>
            <p>
              A voting system’s electronic display must be capable of showing
              all information in a range of text sizes that voters can select
              from, with a default text size at least 4.8 mm (based on the
              height of the uppercase I), allowing voters to both increase and
              decrease the text size.
            </p>
            <p>
              The voting system may meet this requirement in one of the
              following ways:
            </p>
            <ol>
              <li>
                <p>
                  Provide continuous scaling with a minimum increment of 0.5 mm
                  that covers the full range of text sizes from 3.5 mm to 9.0
                  mm.
                </p>
              </li>
              <li>
                <p>
                  Provide at least four discrete text sizes, in which the main
                  ballot options fall within one of these ranges.
                </p>
                <ol style={{ listStyle: 'lower-alpha' }}>
                  <li>3.5-4.2 mm (10-12 points)</li>
                  <li>4.8-5.6 mm (14-16 points)</li>
                  <li>6.4-7.1 mm (18-20 points)</li>
                  <li>8.5-9.0 mm (24-25 points)</li>
                </ol>
              </li>
            </ol>
            <h2>Discussion</h2>
            <p>
              The text size requirements have been updated from the VVSG 1.1
              [VVSG2015] requirement to better meet the needs of voters who need
              larger text, including older voters, voters with low literacy, and
              voters with some cognitive disabilities.
            </p>
            <p>
              This requirement also fills a gap in the text sizes required in
              VVSG 1.1 which omitted text sizes needed or preferred by many
              voters. Although larger font sizes assist most voters with low
              vision, certain visual disabilities such as tunnel vision require
              smaller text.
            </p>
            <p>
              The sizes are minimums. These ranges are not meant to limit the
              text on the screen to a single size. The text can fall in several
              of these text sizes. For example, candidate names or voting
              options might be in the 4.8-5.6 mm range, secondary information in
              the 3.5-4.2 mm range, and titles or button labels in the 6.4-7.1
              mm range.
            </p>
            <p>
              The default text size of 4.8 mm is based on WCAG 2.0 [W3C10] and
              Section 508 [USAB18].
            </p>
          </Slide>
          <Slide>
            <OneInchBox />
            <EightPointFiveMmBox />
            <h1>VVSG Text Sizes in “mm”</h1>
            {vvsgMinMm.map((size) => (
              <div key={size} style={{ fontSize: `${size}mm` }}>
                Letter I in font size: {size}mm
              </div>
            ))}
            <h1>VVSG Text Sizes in “pt”</h1>
            {vvsgMinP.map((size) => (
              <div key={size} style={{ fontSize: `${size}pt` }}>
                Letter I in font size: {size}pt
              </div>
            ))}
          </Slide>
          <Slide>
            <div>
              <code>window.screen.width/height</code>: {window.screen.width} x{' '}
              {window.screen.height}
            </div>
            <div>
              <code>window.devicePixelRatio</code>: {window.devicePixelRatio}
            </div>
            <div>
              Manually measured/entered screen physical dimensions (inches):{' '}
              {screen['widthInches']} x {screen['heightInches']}
            </div>
            <div>
              (horizontal: {window.screen.width / screen['widthInches']})<br />
              (vertical: {window.screen.height / screen['heightInches']})
              <br />
              Calculated display PPI: {screenInchPx}
              <br />1 inch = 72 points
            </div>
          </Slide>
          <Slide>
            <div>
              <OneInchPpiBox />
              <br />
              <br />
              <br />
              <TwentyFourPointBox />
              <br />
              (166 / 72) * 24 = 55.33333
              <br />
              <br />
              <br />
              <TwentyFourPointBoxAdjusted />
              <br />
              (166 / 72) * 24 * 1.4 = 77.4667 &rarr; rounded to 77px
            </div>
          </Slide>
          <Slide>
            <h1>VVSG Min using Points, Adjusted to pixels</h1>
            {vvsgMinP.map((size) => (
              <div key={size} style={{ fontSize: `${fontSize(size)}px` }}>
                Letter I in font size: {size}pt
              </div>
            ))}
          </Slide>
        </Screen>
      </ThemeProvider>
    </React.Fragment>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UserInterfaceScreen />;
}
