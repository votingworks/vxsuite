export type MarkScanControllerButton =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'rate-up'
  | 'rate-down'
  | 'volume-up'
  | 'volume-down'
  | 'help'
  | 'pause';

interface MarkScanControllerIllustrationProps {
  highlight?: MarkScanControllerButton;
}

const HIGHLIGHT_FILL = '#885fce';
export const MARK_SCAN_CONTROLLER_ILLUSTRATION_HIGHLIGHT_FILL = HIGHLIGHT_FILL;

/* istanbul ignore next - temporarily tested via apps/mark-scan */
export function MarkScanControllerIllustration({
  highlight,
}: MarkScanControllerIllustrationProps): JSX.Element {
  return (
    <svg
      viewBox="25 40 160 160"
      version="1.1"
      id="svg5"
      xmlSpace="preserve"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Accessible Controller Illustration</title>
      <g id="layer1">
        <rect
          fill="none"
          stroke="#000000"
          strokeWidth="2.465"
          id="rect184"
          width="153.13997"
          height="153.13998"
          x="28.7325"
          y="45.232498"
          rx="18.410276"
          ry="19.247101"
        />
        <g
          id="g9197"
          transform="matrix(1.0474341,0,0,1.0474341,-5.2047137,-9.7350275)"
        >
          <path
            data-testid="left"
            fill={highlight === 'left' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="2.5"
            strokeLinejoin="round"
            d="m 63.21558,109.32741 v 32.712 L 46.405243,125.68342 Z"
            id="path6813"
          />
          <path
            data-testid="up"
            fill={highlight === 'up' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="2.5"
            strokeLinejoin="round"
            d="M 100.9252,104.77458 H 68.213198 L 84.569192,87.964243 Z"
            id="path6813-2"
          />
          <path
            data-testid="down"
            fill={highlight === 'down' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="2.5"
            strokeLinejoin="round"
            d="M 68.213198,147.00378 H 100.9252 l -16.355997,16.80886 z"
            id="path6813-2-5"
          />
          <path
            data-testid="right"
            fill={highlight === 'right' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="2.5"
            strokeLinejoin="round"
            d="m 106.30715,142.03938 v -32.71199 l 16.81034,16.35599 z"
            id="path6813-2-6"
          />
        </g>
        <circle
          data-testid="select"
          fill={highlight === 'select' ? HIGHLIGHT_FILL : 'none'}
          stroke="#000000"
          strokeWidth="2.5"
          strokeLinejoin="round"
          id="path9191"
          cx="151.78627"
          cy="121.99416"
          r="12.847383"
        />
        <g>
          <rect
            data-testid="help"
            fill={highlight === 'help' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
            id="rect10678-77"
            width="16.343853"
            height="16.343853"
            x="42.200451"
            y="57.700451"
            rx="4.2984958"
            ry="3.9077237"
          />
          <path
            d="m 48.644064,63.596124 c 0,-0.76891 0.625151,-1.39407 1.394065,-1.39407 h 0.697032 c 0.768913,0 1.394064,0.62516 1.394064,1.39407 v 0.0784 c 0,0.47486 -0.241783,0.91704 -0.640398,1.17189 l -0.919211,0.5903 c -0.548913,0.35287 -0.880003,0.9606 -0.880003,1.61189 v 0.0327 c 0,0.38555 0.311486,0.69703 0.697032,0.69703 0.385545,0 0.697032,-0.31148 0.697032,-0.69703 v -0.0305 c 0,-0.17861 0.09148,-0.34415 0.239605,-0.44 l 0.919211,-0.5903 c 0.79723,-0.51406 1.280796,-1.39624 1.280796,-2.34595 v -0.0784 c 0,-1.54001 -1.248123,-2.78813 -2.788128,-2.78813 h -0.697032 c -1.540006,0 -2.788129,1.24812 -2.788129,2.78813 0,0.38554 0.311486,0.69703 0.697032,0.69703 0.385546,0 0.697032,-0.31149 0.697032,-0.69703 z m 1.742581,6.97032 a 0.8712903,0.8712903 0 1 0 0,-1.74258 0.8712903,0.8712903 0 1 0 0,1.74258 z"
            id="path28013"
            strokeWidth="0.0217822"
          />
        </g>
        <g id="g25380" transform="translate(3.1750001)">
          <path
            id="rect10678-7"
            data-testid="rate-down"
            fill={highlight === 'rate-down' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="m 136.29567,167.70045 12.04536,0.0505 v 16.24294 c 0,0 -8.03015,0.0505 -12.04536,0.0505 -2.38136,0 -4.29849,-1.74284 -4.29849,-3.90772 v -8.5284 c 0,-2.16488 1.91713,-3.90773 4.29849,-3.90773 z"
          />
          <path
            id="rect10678-7-6"
            data-testid="rate-up"
            fill={highlight === 'rate-up' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="m 160.47841,167.70045 -12.04536,0.0505 v 16.24294 c 0,0 8.03015,0.0505 12.04536,0.0505 2.38136,0 4.29849,-1.74284 4.29849,-3.90772 v -8.5284 c 0,-2.16488 -1.91713,-3.90773 -4.29849,-3.90773 z"
          />
        </g>
        <g id="g25380-3" transform="translate(3.17527,-110)">
          <path
            id="rect10678-7-4"
            data-testid="volume-down"
            fill={highlight === 'volume-down' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="m 136.29567,167.70045 12.04536,0.0505 v 16.24294 c 0,0 -8.03015,0.0505 -12.04536,0.0505 -2.38136,0 -4.29849,-1.74284 -4.29849,-3.90772 v -8.5284 c 0,-2.16488 1.91713,-3.90773 4.29849,-3.90773 z"
          />
          <path
            id="rect10678-7-6-3"
            data-testid="volume-up"
            fill={highlight === 'volume-up' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
            d="m 160.47841,167.70045 -12.04536,0.0505 v 16.24294 c 0,0 8.03015,0.0505 12.04536,0.0505 2.38136,0 4.29849,-1.74284 4.29849,-3.90772 v -8.5284 c 0,-2.16488 -1.91713,-3.90773 -4.29849,-3.90773 z"
          />
        </g>
        <path
          d="m 160.5616,61.041143 c 0,-0.481673 -0.38915,-0.870821 -0.87082,-0.870821 -0.48167,0 -0.87082,0.389148 -0.87082,0.870821 v 3.918697 h -3.9187 c -0.48167,0 -0.87082,0.389149 -0.87082,0.870821 0,0.481674 0.38915,0.870822 0.87082,0.870822 h 3.9187 v 3.918697 c 0,0.481674 0.38915,0.870822 0.87082,0.870822 0.48167,0 0.87082,-0.389148 0.87082,-0.870822 v -3.918697 h 3.9187 c 0.48167,0 0.87082,-0.389148 0.87082,-0.870822 0,-0.481672 -0.38915,-0.870821 -0.87082,-0.870821 h -3.9187 z"
          id="path29547"
          strokeWidth="0.0272132"
        />
        <path
          d="m 149.2,65.979017 c 0,0.498084 -0.40241,0.900492 -0.9005,0.900492 h -9.90541 c -0.49809,0 -0.90049,-0.402408 -0.90049,-0.900492 0,-0.498084 0.4024,-0.900492 0.90049,-0.900492 h 9.90541 c 0.49809,0 0.9005,0.402408 0.9005,0.900492 z"
          id="path30322"
          strokeWidth="0.0281403"
        />
        <path
          d="m 159.08993,172.85286 c 0.35793,-0.35793 0.9392,-0.35793 1.29713,0 l 4.58156,4.58154 c 0.35793,0.35793 0.35793,0.93921 0,1.29715 -0.35794,0.35793 -0.93922,0.35793 -1.29715,0 l -3.9344,-3.9344 -3.9344,3.93154 c -0.35794,0.35793 -0.93922,0.35793 -1.29715,0 -0.35793,-0.35794 -0.35793,-0.93922 0,-1.29715 l 4.58155,-4.58156 z"
          id="path31089"
          strokeWidth="0.0286347"
        />
        <path
          d="m 142.85286,179.23155 c 0.35793,0.35793 0.93922,0.35793 1.29715,0 l 4.58153,-4.58154 c 0.35795,-0.35794 0.35795,-0.93922 0,-1.29715 -0.35793,-0.35794 -0.93921,-0.35794 -1.29714,0 l -3.9344,3.9344 -3.93441,-3.93154 c -0.35793,-0.35793 -0.93922,-0.35793 -1.29714,0 -0.35794,0.35793 -0.35794,0.93922 0,1.29715 l 4.58154,4.58154 z"
          id="path31856"
          strokeWidth="0.0286346"
        />
        <g id="g33812">
          <rect
            data-testid="pause"
            fill={highlight === 'pause' ? HIGHLIGHT_FILL : 'none'}
            stroke="#000000"
            strokeWidth="1.8"
            strokeLinejoin="round"
            id="rect10678"
            width="16.343853"
            height="16.343853"
            x="42.200451"
            y="167.70045"
            rx="4.2984958"
            ry="3.9077237"
          />
          <path
            d="m 48.30818,180.33017 c -0.60367,0 -1.091388,-0.3049 -1.091388,-0.68231 v -7.50534 c 0,-0.3774 0.487718,-0.6823 1.091388,-0.6823 0.60368,0 1.091398,0.3049 1.091398,0.6823 v 7.50534 c 0,0.37741 -0.487718,0.68231 -1.091398,0.68231 z"
            id="path30322-1"
            strokeWidth="0.0269667"
          />
          <path
            d="m 52.508602,180.33017 c -0.60367,0 -1.091388,-0.3049 -1.091388,-0.68231 v -7.50534 c 0,-0.3774 0.487718,-0.6823 1.091388,-0.6823 0.60368,0 1.091398,0.3049 1.091398,0.6823 v 7.50534 c 0,0.37741 -0.487718,0.68231 -1.091398,0.68231 z"
            id="path30322-1-2"
            strokeWidth="0.0269667"
          />
        </g>
      </g>
    </svg>
  );
}
