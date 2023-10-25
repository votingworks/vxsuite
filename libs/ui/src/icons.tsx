import styled from 'styled-components';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faCircleHalfStroke,
  faCircleLeft,
  faCircleRight,
  faDeleteLeft,
  faDisplay,
  faExclamationCircle,
  faExclamationTriangle,
  faFloppyDisk,
  faGear,
  faInfoCircle,
  faMinusCircle,
  faPencil,
  faXmark,
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faTextHeight,
  faBan,
  faCheckSquare,
  faChevronCircleUp,
  faChevronCircleDown,
  faChevronRight,
  faChevronLeft,
  faSpinner,
  faCaretDown,
  faCirclePlus,
  faRotateRight,
  faCircleQuestion,
} from '@fortawesome/free-solid-svg-icons';
import {
  faXmarkCircle,
  faPauseCircle,
  faSquare,
  faCircle,
  faCircleDot,
} from '@fortawesome/free-regular-svg-icons';

import { Font, FontProps } from './typography';
import { ScreenInfo, useScreenInfo } from './hooks/use_screen_info';

interface InnerProps {
  pulse?: boolean;
  spin?: boolean;
  type: IconDefinition;
}

const StyledSvgIcon = styled.svg`
  fill: currentColor;
  height: 1em;
  width: 1em;
`;

function FaIcon(props: InnerProps): JSX.Element {
  const { pulse, spin, type } = props;

  return <FontAwesomeIcon icon={type} spin={spin} pulse={pulse} />;
}

/**
 * Provides commonly used icons for communicating meaning/context to the user.
 * The VVSG spec recommends using iconography instead of/in addition to any
 * colors.
 */
export const Icons = {
  Add(): JSX.Element {
    return <FaIcon type={faCirclePlus} />;
  },

  Backspace(): JSX.Element {
    return <FaIcon type={faDeleteLeft} />;
  },

  CaretDown(): JSX.Element {
    return <FaIcon type={faCaretDown} />;
  },

  Circle(): JSX.Element {
    return <FaIcon type={faCircle} />;
  },

  CircleDot(): JSX.Element {
    return <FaIcon type={faCircleDot} />;
  },

  Checkbox(): JSX.Element {
    return <FaIcon type={faCheckSquare} />;
  },

  Checkmark(): JSX.Element {
    return (
      <StyledSvgIcon
        aria-hidden="true"
        role="img"
        width="100"
        height="100"
        viewBox="0 0 100 100"
      >
        <path d="M89.7038 10.1045C88.2094 8.40006 85.759 8.40006 84.2646 10.1045L39.0198 61.5065L15.719 34.8471C14.2245 33.1364 11.7906 33.1364 10.2852 34.8471L2.12082 44.1186C0.626395 45.8105 0.626395 48.5951 2.12082 50.2996L36.2782 89.3708C37.7727 91.0628 40.2066 91.0628 41.7175 89.3708L97.8627 25.5632C99.3791 23.8587 99.3791 21.0679 97.8627 19.3572L89.7038 10.1045Z" />
      </StyledSvgIcon>
    );
  },

  Closed(): JSX.Element {
    return <FaIcon type={faMinusCircle} />;
  },

  Contrast(): JSX.Element {
    return <FaIcon type={faCircleHalfStroke} />;
  },

  Danger(): JSX.Element {
    return <FaIcon type={faExclamationCircle} />;
  },

  Delete(): JSX.Element {
    return <FaIcon type={faXmarkCircle} />;
  },

  Disabled(): JSX.Element {
    return <FaIcon type={faBan} />;
  },

  Display(): JSX.Element {
    return <FaIcon type={faDisplay} />;
  },

  Done(): JSX.Element {
    return <FaIcon type={faCheckCircle} />;
  },

  DownChevron(): JSX.Element {
    return <FaIcon type={faChevronCircleDown} />;
  },

  Edit(): JSX.Element {
    return <FaIcon type={faPencil} />;
  },

  Info(): JSX.Element {
    return <FaIcon type={faInfoCircle} />;
  },

  Loading(): JSX.Element {
    return <FaIcon type={faSpinner} pulse spin />;
  },

  Next(): JSX.Element {
    return <FaIcon type={faCircleRight} />;
  },

  Paused(): JSX.Element {
    return <FaIcon type={faPauseCircle} />;
  },

  Previous(): JSX.Element {
    return <FaIcon type={faCircleLeft} />;
  },

  Question(): JSX.Element {
    return <FaIcon type={faCircleQuestion} />;
  },

  RightChevron(): JSX.Element {
    return <FaIcon type={faChevronRight} />;
  },

  LeftChevron(): JSX.Element {
    return <FaIcon type={faChevronLeft} />;
  },

  RotateRight(): JSX.Element {
    return <FaIcon type={faRotateRight} />;
  },

  Save(): JSX.Element {
    return <FaIcon type={faFloppyDisk} />;
  },

  Square(): JSX.Element {
    return <FaIcon type={faSquare} />;
  },

  Settings(): JSX.Element {
    return <FaIcon type={faGear} />;
  },

  TextSize(): JSX.Element {
    return <FaIcon type={faTextHeight} />;
  },

  UpChevron(): JSX.Element {
    return <FaIcon type={faChevronCircleUp} />;
  },

  Warning(): JSX.Element {
    return <FaIcon type={faExclamationTriangle} />;
  },

  X(): JSX.Element {
    return <FaIcon type={faXmark} />;
  },

  ZoomIn(): JSX.Element {
    return <FaIcon type={faMagnifyingGlassPlus} />;
  },

  ZoomOut(): JSX.Element {
    return <FaIcon type={faMagnifyingGlassMinus} />;
  },
} as const;

export type IconName = keyof typeof Icons;

/** Props for {@link FullScreenIconWrapper}. */
export type FullScreenIconWrapperProps = FontProps;

type FullScreenIconContainerProps = FullScreenIconWrapperProps & {
  screenInfo: ScreenInfo;
};

const FullScreenIconContainer = styled(Font)<FullScreenIconContainerProps>`
  display: block;
  font-size: ${(p) => (p.screenInfo.isPortrait ? '24vw' : '24vh')};
`;

/**
 * Displays the provided child icon at an appropriate full-screen size,
 * depending on screen orientation.
 *
 * Extends the `<Font>` component to support theme-aware accent coloring via the
 * `color` prop.
 *
 * Sample Usage:
 * ```
 * <FullScreenIconWrapper color="success">
 *   <Icons.Done />
 * </FullScreenIconWrapper>
 * ```
 */
export function FullScreenIconWrapper(
  props: FullScreenIconWrapperProps
): JSX.Element {
  const screenInfo = useScreenInfo();

  return <FullScreenIconContainer {...props} screenInfo={screenInfo} />;
}
