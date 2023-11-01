import styled, { css, keyframes } from 'styled-components';

import { Svg } from './svg';

export type BallotFeedLocation = 'bottom' | 'top';

export interface InsertBallotImageProps {
  disableAnimation?: boolean;
  /** @default 'top' */
  ballotFeedLocation?: BallotFeedLocation;
}

const ballotFeedAnimationKeyframes = keyframes`
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  10% {
    transform: translateY(-6.5%);
  }
  40% {
    transform: translateY(-6.5%);
  }
  60% {
    transform: translateY(-70%);
    opacity: 1;
  }
  80% {
    opacity: 0;
    transform: translateY(-70%);
  }
  81% {
    opacity: 0;
    transform: translateY(0%);
  }
  100% {
    opacity: 1;
    transform: translateY(0%);
  }
`;

interface BallotSheetProps {
  disableAnimation?: boolean;
}

const ballotSheetAnimation = css`
  animation: ${ballotFeedAnimationKeyframes} 4s ease-in-out infinite;
`;

const BallotSheetGroup = styled.g<BallotSheetProps>`
  ${(p) => (p.disableAnimation ? undefined : ballotSheetAnimation)}
`;

const ForegroundLine = styled.line`
  stroke: ${(p) => p.theme.colors.onBackground};
  stroke-width: 9.57px;
`;

const Bubble = styled.ellipse`
  fill: none;
  stroke: ${(p) => p.theme.colors.onBackground};
  stroke-linejoin: round;
  stroke-width: 5px;
`;

const FilledBubble = styled(Bubble)`
  fill: ${(p) => p.theme.colors.onBackground};
`;

export function InsertBallotImage(props: InsertBallotImageProps): JSX.Element {
  const { ballotFeedLocation = 'top', disableAnimation } = props;

  return (
    <Svg.FullScreenSvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <defs>
        <clipPath id="InsertBallotImage--ballot-feed-mask">
          <rect x="0" y="140" width="512" height="372" />
        </clipPath>
      </defs>
      <Svg.ForegroundFillPath d="M484.9,139.15v26.6H27.1v-26.6H484.9m12.4-21.1H14.7a8.7,8.7,0,0,0-8.7,8.7v51.4a8.71,8.71,0,0,0,8.7,8.71H497.3a8.71,8.71,0,0,0,8.7-8.71v-51.4a8.7,8.7,0,0,0-8.7-8.7Z" />
      <g>
        <g clipPath="url(#InsertBallotImage--ballot-feed-mask)">
          <BallotSheetGroup disableAnimation={disableAnimation}>
            <Svg.BackgroundFillPath d="M452.25 506.57H69.75L101 148.71H416.91L452.25 506.57Z" />
            <Svg.ForegroundFillPath d="M452.25 512H69.75C68.9664 512.001 68.192 511.832 67.4799 511.504C66.7678 511.177 66.135 510.7 65.6248 510.105C65.1146 509.511 64.7392 508.813 64.5243 508.059C64.3094 507.306 64.2602 506.514 64.38 505.74L95.5 148.17C95.6982 146.888 96.3487 145.72 97.3337 144.876C98.3186 144.032 99.5731 143.569 100.87 143.57L416.91 143.28C418.258 143.278 419.558 143.778 420.558 144.682C421.558 145.586 422.186 146.829 422.32 148.17L457.65 506C457.73 506.757 457.65 507.522 457.415 508.246C457.18 508.97 456.795 509.637 456.286 510.203C455.777 510.768 455.154 511.221 454.459 511.53C453.764 511.84 453.011 512 452.25 512ZM76.08 501.14H446.25L412 154.14L105.57 154.43L76.08 501.14Z" />
            <g>
              <Svg.ForegroundFillPath d="M150.71,174.49h18.7a38,38,0,0,1,6.27.48,14.79,14.79,0,0,1,4.85,1.61,7.35,7.35,0,0,1,3,3,8.23,8.23,0,0,1,.73,4.65,8.46,8.46,0,0,1-2.64,5.42,12.75,12.75,0,0,1-6.68,3.11v.11a11.84,11.84,0,0,1,7.21,2.81,7.36,7.36,0,0,1,2.17,6.4,12.47,12.47,0,0,1-1.3,4.49,10.33,10.33,0,0,1-3.35,3.76,18.53,18.53,0,0,1-5.78,2.59,32.82,32.82,0,0,1-8.56,1H145.81Zm9.35,15.86h3.22c3.15,0,5.48-.39,7-1.18a4.67,4.67,0,0,0,2.57-3.95c.2-1.85-.32-3.15-1.54-3.91s-3.23-1.13-6-1.13h-4.05Zm-2,17.53h4.46a15.65,15.65,0,0,0,6.84-1.3,5.49,5.49,0,0,0,3.05-4.77,5.27,5.27,0,0,0-.38-2.87,4.43,4.43,0,0,0-1.63-1.83,7,7,0,0,0-2.62-1,19.2,19.2,0,0,0-3.45-.28h-4.89Z" />
              <Svg.ForegroundFillPath d="M204.63,174.49h13.81L231,213.9h-12l-2.08-8.55H201.72l-3.32,8.55h-12Zm-.4,24.26h11.08l-4.18-17.6H211Z" />
              <Svg.ForegroundFillPath d="M235,213.9l2-39.41h11.18l-1.37,32.71h20.33l-.17,6.7Z" />
              <Svg.ForegroundFillPath d="M272.08,213.9l.83-39.41h11.17l-.38,32.71H304l0,6.7Z" />
              <Svg.ForegroundFillPath d="M307.83,193.87a52.24,52.24,0,0,1,.52-8.19,13.88,13.88,0,0,1,2.51-6.36,12.58,12.58,0,0,1,5.66-4.11,27.66,27.66,0,0,1,10-1.47,28.23,28.23,0,0,1,10.05,1.47,13.47,13.47,0,0,1,5.86,4.11,14.68,14.68,0,0,1,2.83,6.36,53.79,53.79,0,0,1,.91,8.19,53.15,53.15,0,0,1-.26,8.31,14.12,14.12,0,0,1-2.37,6.61,12.67,12.67,0,0,1-5.72,4.34,27.75,27.75,0,0,1-10.3,1.57,28.4,28.4,0,0,1-10.38-1.57,13.57,13.57,0,0,1-5.93-4.34,14.89,14.89,0,0,1-2.7-6.61A54.69,54.69,0,0,1,307.83,193.87Zm11.35,0c.05,2.66.18,4.92.4,6.8a14.26,14.26,0,0,0,1.2,4.59,5.6,5.6,0,0,0,2.44,2.59,8.92,8.92,0,0,0,4.13.82,8.66,8.66,0,0,0,4.09-.82,5.23,5.23,0,0,0,2.32-2.59,13.91,13.91,0,0,0,1-4.59c.13-1.88.15-4.14.07-6.8s-.24-4.87-.48-6.69a14.16,14.16,0,0,0-1.23-4.46,5.46,5.46,0,0,0-2.42-2.51,8.92,8.92,0,0,0-4-.78,8.76,8.76,0,0,0-4,.78,5.13,5.13,0,0,0-2.29,2.51,13.74,13.74,0,0,0-1,4.46Q319.12,189.91,319.18,193.87Z" />
              <Svg.ForegroundFillPath d="M382.54,174.49l.45,6.34H370.82l2,33.07H361.31l-1.72-33.07H347.42l-.26-6.34Z" />
            </g>
            <ForegroundLine x1="262.5" y1="230.012" x2="256.451" y2="479.011" />
            <FilledBubble cx="185" cy="270" rx="38" ry="20" />
            <Bubble cx="340" cy="270" rx="38" ry="20" />

            <Bubble cx="178" cy="350" rx="39" ry="21" />
            <FilledBubble cx="345" cy="350" rx="39" ry="21" />

            <Bubble cx="170" cy="430" rx="40" ry="22" />
            <FilledBubble cx="350" cy="430" rx="40" ry="22" />
          </BallotSheetGroup>
        </g>
      </g>
      {ballotFeedLocation === 'bottom' && (
        <g>
          <Svg.PrimaryFillPath d="M256 104.53C255.397 104.529 254.803 104.391 254.261 104.128C253.719 103.865 253.244 103.483 252.87 103.01L211.57 50.59C211.11 50.0008 210.825 49.2947 210.746 48.5516C210.668 47.8085 210.798 47.0582 211.124 46.3858C211.45 45.7133 211.958 45.1456 212.59 44.7469C213.222 44.3482 213.953 44.1345 214.7 44.13H231.63V4C231.63 2.93913 232.051 1.92172 232.802 1.17157C233.552 0.421427 234.569 0 235.63 0L276.41 0C277.471 0 278.488 0.421427 279.238 1.17157C279.989 1.92172 280.41 2.93913 280.41 4V44.13H297.3C298.047 44.1345 298.778 44.3482 299.41 44.7469C300.042 45.1456 300.55 45.7133 300.876 46.3858C301.201 47.0582 301.332 47.8085 301.254 48.5516C301.175 49.2947 300.889 50.0008 300.43 50.59L259.13 103C258.757 103.475 258.282 103.859 257.74 104.124C257.198 104.389 256.603 104.528 256 104.53ZM222.92 52.11L256 94.1L289.08 52.1H276.39C275.329 52.1 274.312 51.6786 273.562 50.9284C272.811 50.1783 272.39 49.1609 272.39 48.1V8H239.6V48.12C239.6 49.1809 239.179 50.1983 238.428 50.9484C237.678 51.6986 236.661 52.12 235.6 52.12L222.92 52.11Z" />
          <Svg.PrimaryFillPath d="M276.39 3.98999H235.61V48.12H214.7L256 100.54L297.3 48.12H276.39V3.98999Z" />
        </g>
      )}
    </Svg.FullScreenSvg>
  );
}
