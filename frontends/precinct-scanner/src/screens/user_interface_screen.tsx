// import { FONT_SIZES } from '@votingworks/ui';
import React, { useContext } from 'react';
import styled from 'styled-components';
import { AppContext } from '../contexts/app_context';

// 1920 x 1080 FHD
// Elo 13" (E683595) 11.57" x 6.5"  166ppi (165.946413137424373)
// Elo 15" (E155645) 13.55" x 7.62" 141.21ppi (141.697416974169742)

const screen: {
  [key: string]: number;
} = {
  widthInches: 6.5,
  heightInches: 11.57,
};

const screenPpi = Math.round(
  Math.hypot(window.screen.width, window.screen.height) /
    Math.hypot(screen['heightInches'], screen['widthInches'])
);

function fontSize(size: number): number {
  return Math.round((screenPpi / 72) * size * 1.4);
}

const ScrollContainer = styled.div`
  height: 100%;
  overflow: auto;
  background: #fff;
  color: #000;
  user-select: text;
`;

const Slide = styled.div`
  // height: 100%;
  margin: 2rem;
  padding: 1em;
  border-bottom: 1px solid;
`;

const OneInchPpiBox = styled.div`
  display: inline-block;
  width: ${screenPpi}px;
  height: ${screenPpi}px;
  background: tan;
  &:after {
    display: block;
    content: '${screenPpi}px (1 physical inch on screen)';
    padding: 1em;
    font-size: 50%;
  }
`;

const TwentyFourPointBox = styled.div`
  width: ${Math.round((screenPpi / 72) * 24)}px;
  height: ${Math.round((screenPpi / 72) * 24)}px;
  background: orange;
  &:after {
    content: '(I) 24pt';
    white-space: nowrap;
    font-size: ${Math.round((screenPpi / 72) * 24)}px;
  }
`;

const TwentyFourPointBoxAdjusted = styled.div`
  // display: inline-block;
  position: relative;
  width: ${Math.round((screenPpi / 72) * 24)}px;
  height: ${Math.round((screenPpi / 72) * 24)}px;
  background: orange;
  &:after {
    position: absolute;
    top: -12px;
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
//     <p>base font size</p>
//   </React.Fragment>
// );

export function UserInterfaceScreen(): JSX.Element {
  const { userSettings, isSoundMuted } = useContext(AppContext);
  return (
    <ScrollContainer>
      <Slide>
        <h1>userSettings</h1>
        <code>
          <pre>{JSON.stringify({ userSettings })}</pre>
          <pre>{JSON.stringify({ isSoundMuted })}</pre>
        </code>
      </Slide>
      <Slide>
        <h1>7.1-G – Text size (electronic display)</h1>
        <p>
          A voting system’s electronic display must be capable of showing all
          information in a range of text sizes that voters can select from, with
          a default text size at least 4.8 mm (based on the height of the
          uppercase I), allowing voters to both increase and decrease the text
          size.
        </p>
        <p>
          The voting system may meet this requirement in one of the following
          ways:
        </p>
        <ol>
          <li>
            <p>
              Provide continuous scaling with a minimum increment of 0.5 mm that
              covers the full range of text sizes from 3.5 mm to 9.0 mm.
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
          This requirement also fills a gap in the text sizes required in VVSG
          1.1 which omitted text sizes needed or preferred by many voters.
          Although larger font sizes assist most voters with low vision, certain
          visual disabilities such as tunnel vision require smaller text.
        </p>
        <p>
          The sizes are minimums. These ranges are not meant to limit the text
          on the screen to a single size. The text can fall in several of these
          text sizes. For example, candidate names or voting options might be in
          the 4.8-5.6 mm range, secondary information in the 3.5-4.2 mm range,
          and titles or button labels in the 6.4-7.1 mm range.
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
          Calculated display PPI: {screenPpi}
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
        {/* <Rule />
        <h1>VVSG Max in Points</h1>
        {vvsgMaxP.map((size) => (
          <div key={size} style={{ fontSize: `${size}pt` }}>
            Letter I in font size: {size}pt
          </div>
        ))} */}
      </Slide>
      <Slide>
        <h1>Text-Size Themes</h1>
        <code>
          <pre>
            <div>[&#123;</div>
            <div> default: 10,</div>
            <div> small: 10,</div>
            <div> h1: 20,</div>
            <div> h2: 14,</div>
            <div> h3: 12,</div>
            <div> smSpace: 5,</div>
            <div> mdSpace: 10,</div>
            <div> lgSpace: 20,</div>
            <div>&#125;,&#123;</div>
            <div> default: 14,</div>
            <div> ...</div>
            <div>&#125;,&#123;</div>
            <div> default: 18,</div>
            <div> ...</div>
            <div>&#125;,&#123;</div>
            <div> default: 24,</div>
            <div> ...</div>
            <div>&#125;]</div>
          </pre>
        </code>
      </Slide>
    </ScrollContainer>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UserInterfaceScreen />;
}
