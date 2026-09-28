import { styled } from '../styled.js';

import { Keybinding } from '../keybindings.js';
import type { MarkControllerButton } from './types.js';

interface MarkControllerIllustrationProps {
  highlight?: MarkControllerButton;
}

const BUTTON_CLASS_NAME = 'markControllerIllustrationButton';
const BUTTON_CLASS_NAME_HIGHLIGHTED = `${BUTTON_CLASS_NAME}--highlighted`;
const BUTTON_FOREGROUND_CLASS_NAME = `${BUTTON_CLASS_NAME}Foreground`;
const ARROW_TIP_CLASS_NAME = `${BUTTON_CLASS_NAME}ArrowTip`;

export const MARK_CONTROLLER_ILLUSTRATION_HIGHLIGHT_CLASS_NAME =
  BUTTON_CLASS_NAME_HIGHLIGHTED;

const SvgContainer = styled.svg`
  .${BUTTON_CLASS_NAME} {
    fill: ${(p) => p.theme.colors.background};
    stroke: ${(p) => p.theme.colors.onBackground};
    stroke-width: 3;
    stroke-linejoin: round;

    .${BUTTON_FOREGROUND_CLASS_NAME} {
      fill: ${(p) => p.theme.colors.onBackground};
      stroke: none;
    }

    .${ARROW_TIP_CLASS_NAME} {
      fill: none;
      stroke: ${(p) => p.theme.colors.onBackground};
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }

  .${BUTTON_CLASS_NAME_HIGHLIGHTED} {
    fill: ${(p) => p.theme.colors.primary};
    stroke: ${(p) => p.theme.colors.primary};

    .${BUTTON_FOREGROUND_CLASS_NAME} {
      fill: ${(p) => p.theme.colors.background};
    }
  }
`;

const SQUARE_BUTTON_SIZE = 48;
const SQUARE_BUTTON_RADIUS = 6;

export function MarkControllerIllustration({
  highlight,
}: MarkControllerIllustrationProps): JSX.Element {
  function getButtonClassNames(button: MarkControllerButton) {
    const classNames = [BUTTON_CLASS_NAME];

    if (highlight === button) {
      classNames.push(BUTTON_CLASS_NAME_HIGHLIGHTED);
    }

    return classNames.join(' ');
  }

  return (
    <SvgContainer
      viewBox="-27.2 -13.6 354.4 536.8"
      version="1.1"
      xmlSpace="preserve"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Accessible Controller Illustration</title>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        d="M -19.2 482.6 V 153.5 C -19.2 118 -7.2 92.1 9.8 74.4 L 70 18.4 C 90.2 -0.8 122.4 -5.6 150 -5.6 C 177.6 -5.6 209.8 -0.8 230 18.4 L 290.2 74.4 C 307.2 92.1 319.2 118 319.2 153.5 V 482.6 Q 319.2 515.2 287.9 515.2 H 12.1 Q -19.2 515.2 -19.2 482.6 Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        d="M 33 480 V 165 L 23.7 155.7 Q 18 150 23.7 144.3 L 144.3 23.7 Q 150 18 155.7 23.7 L 276.3 144.3 Q 282 150 276.3 155.7 L 267 165 V 480 Q 267 495 252 495 H 48 Q 33 495 33 480 Z"
      />
      <g
        data-testid="up"
        className={getButtonClassNames(Keybinding.FOCUS_PREVIOUS)}
      >
        <path d="M 144.3 45.7 Q 150 40 155.7 45.7 L 201.5 91.5 L 172 121 L 128 121 L 98.5 91.5 Z" />
        <path
          className={ARROW_TIP_CLASS_NAME}
          d="M 133.7 59.1 L 142 50.8 Q 150 42.8 158 50.8 L 166.3 59.1"
        />
      </g>
      <g
        data-testid="right"
        className={getButtonClassNames(Keybinding.PAGE_NEXT)}
      >
        <path d="M 254.3 144.3 Q 260 150 254.3 155.7 L 208.5 201.5 L 179 172 L 179 128 L 208.5 98.5 Z" />
        <path
          className={ARROW_TIP_CLASS_NAME}
          d="M 240.9 133.7 L 249.2 142 Q 257.2 150 249.2 158 L 240.9 166.3"
        />
      </g>
      <g
        data-testid="down"
        className={getButtonClassNames(Keybinding.FOCUS_NEXT)}
      >
        <path d="M 155.7 254.3 Q 150 260 144.3 254.3 L 98.5 208.5 L 128 179 L 172 179 L 201.5 208.5 Z" />
        <path
          className={ARROW_TIP_CLASS_NAME}
          d="M 166.3 240.9 L 158 249.2 Q 150 257.2 142 249.2 L 133.7 240.9"
        />
      </g>
      <g
        data-testid="left"
        className={getButtonClassNames(Keybinding.PAGE_PREVIOUS)}
      >
        <path d="M 45.7 155.7 Q 40 150 45.7 144.3 L 91.5 98.5 L 121 128 L 121 172 L 91.5 201.5 Z" />
        <path
          className={ARROW_TIP_CLASS_NAME}
          d="M 59.1 166.3 L 50.8 158 Q 42.8 150 50.8 142 L 59.1 133.7"
        />
      </g>
      <g
        data-testid="select"
        className={getButtonClassNames(Keybinding.SELECT)}
      >
        <rect x="126" y="126" width="48" height="48" rx="8" />
      </g>
      <g
        data-testid="volume-up"
        className={getButtonClassNames(Keybinding.VOLUME_UP)}
      >
        <rect
          x="45"
          y="282"
          width={SQUARE_BUTTON_SIZE}
          height={SQUARE_BUTTON_SIZE}
          rx={SQUARE_BUTTON_RADIUS}
        />
        <rect
          className={BUTTON_FOREGROUND_CLASS_NAME}
          x="53"
          y="292"
          width="32"
          height="5"
          rx="2.5"
        />
        <rect
          className={BUTTON_FOREGROUND_CLASS_NAME}
          x="61"
          y="316"
          width="16"
          height="5"
          rx="2.5"
        />
      </g>
      <g
        data-testid="volume-down"
        className={getButtonClassNames(Keybinding.VOLUME_DOWN)}
      >
        <rect
          x="45"
          y="340"
          width={SQUARE_BUTTON_SIZE}
          height={SQUARE_BUTTON_SIZE}
          rx={SQUARE_BUTTON_RADIUS}
        />
        <rect
          className={BUTTON_FOREGROUND_CLASS_NAME}
          x="61"
          y="374"
          width="16"
          height="5"
          rx="2.5"
        />
      </g>
      <g data-testid="headphone-jack" fill="none" stroke="currentColor">
        <circle cx="183" cy="334" r="38" strokeWidth="3" />
        <circle cx="183" cy="334" r="26" strokeWidth="3" />
      </g>
      <g
        data-testid="pause"
        className={getButtonClassNames(Keybinding.TOGGLE_PAUSE)}
      >
        <rect
          x="134"
          y="412"
          width={SQUARE_BUTTON_SIZE}
          height={SQUARE_BUTTON_SIZE}
          rx={SQUARE_BUTTON_RADIUS}
        />
        <circle
          className={BUTTON_FOREGROUND_CLASS_NAME}
          cx="148"
          cy="446"
          r="4"
        />
      </g>
      <g
        data-testid="help"
        className={getButtonClassNames(Keybinding.TOGGLE_HELP)}
      >
        <rect
          x="194"
          y="412"
          width={SQUARE_BUTTON_SIZE}
          height={SQUARE_BUTTON_SIZE}
          rx={SQUARE_BUTTON_RADIUS}
        />
        <circle
          className={BUTTON_FOREGROUND_CLASS_NAME}
          cx="230"
          cy="424"
          r="4"
        />
        <circle
          className={BUTTON_FOREGROUND_CLASS_NAME}
          cx="218"
          cy="436"
          r="4"
        />
        <circle
          className={BUTTON_FOREGROUND_CLASS_NAME}
          cx="206"
          cy="448"
          r="4"
        />
      </g>
    </SvgContainer>
  );
}
