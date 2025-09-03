import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircle,
  faCircleDot,
  faCopy,
  faEye,
  faPauseCircle,
  faSquare,
  faXmarkCircle,
  faCheckSquare,
} from '@fortawesome/free-regular-svg-icons';
import {
  faCheckCircle,
  faCircleHalfStroke,
  faCircleDown,
  faCircleLeft,
  faCircleRight,
  faDoorClosed,
  faDoorOpen,
  faCircleUp,
  faDeleteLeft,
  faDisplay,
  faExclamationCircle,
  faExclamationTriangle,
  faFile,
  faFloppyDisk,
  faGear,
  faBan,
  faCheckSquare as faCheckSquareSolid,
  faChevronCircleUp,
  faChevronCircleDown,
  faChevronRight,
  faChevronLeft,
  faCaretDown,
  faCirclePlus,
  faCircleQuestion,
  faEject,
  faFileArrowUp,
  faFileArrowDown,
  faChevronUp,
  faChevronDown,
  faBatteryFull,
  faBatteryThreeQuarters,
  faBatteryHalf,
  faBatteryQuarter,
  faBatteryEmpty,
  faBolt,
  faEyeSlash,
  faEarthAmericas,
  faBold,
  faGripLines,
  faGripLinesVertical,
  faHardDrive,
  faIdCard,
  faImage,
  faInfoCircle,
  faItalic,
  faKeyboard,
  faLanguage,
  faListOl,
  faListUl,
  faLock,
  faMagnifyingGlass,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faMinusCircle,
  faMouse,
  faPause,
  faPencil,
  faPlay,
  faPowerOff,
  faPrint,
  faRotateRight,
  faSimCard,
  faSort,
  faSortDown,
  faTowerBroadcast,
  faRotate,
  faEnvelope,
  faFlag,
  faSortUp,
  faSpinner,
  faStrikethrough,
  faTable,
  faTextHeight,
  faTrash,
  faUnderline,
  faVolumeHigh,
  faVolumeMute,
  faVolumeUp,
  faVolumeXmark,
  faXmark,
  faCircleUser,
  faArrowRightFromBracket,
  faQrcode,
} from '@fortawesome/free-solid-svg-icons';
import { faUsb } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import styled, { useTheme } from 'styled-components';

import { UiTheme } from '@votingworks/types';
import { ScreenInfo, useScreenInfo } from './hooks/use_screen_info';
import { Font, FontProps } from './typography';

export const ICON_COLORS = [
  'neutral',
  'primary',
  'success',
  'warning',
  'danger',
  'inverse',
  'inversePrimary',
  'inverseWarning',
] as const;

export type IconColor = (typeof ICON_COLORS)[number];

export interface IconProps {
  color?: IconColor;
  style?: React.CSSProperties;
}

export type IconComponent = (props: IconProps) => JSX.Element;

interface InnerProps extends IconProps {
  pulse?: boolean;
  spin?: boolean;
  type: IconDefinition;
}

const StyledSvgIcon = styled.svg`
  fill: currentColor;
  height: 1em;
  width: 1em;
`;

function iconColor(theme: UiTheme, color?: IconColor) {
  if (!color) {
    return undefined;
  }
  const { colors } = theme;
  return {
    neutral: colors.onBackground,
    primary: colors.primary,
    success: colors.successAccent,
    warning: colors.warningAccent,
    danger: colors.dangerAccent,
    inverse: colors.onInverse,
    inversePrimary: colors.inversePrimary,
    inverseWarning: colors.inverseWarningAccent,
    default: undefined,
  }[color];
}

function FaIcon(props: InnerProps): JSX.Element {
  const { pulse, spin, type, color, style = {} } = props;
  const theme = useTheme();

  return (
    <FontAwesomeIcon
      icon={type}
      spin={spin}
      pulse={pulse}
      style={{
        color: iconColor(theme, color),
        ...style,
      }}
    />
  );
}

/**
 * Provides commonly used icons for communicating meaning/context to the user.
 * The VVSG spec recommends using iconography instead of/in addition to any
 * colors.
 */
export const Icons = {
  Add(props) {
    return <FaIcon {...props} type={faCirclePlus} />;
  },

  Antenna(props) {
    return <FaIcon {...props} type={faTowerBroadcast} />;
  },

  Backspace(props) {
    return <FaIcon {...props} type={faDeleteLeft} />;
  },

  BatteryFull(props) {
    return <FaIcon {...props} type={faBatteryFull} />;
  },

  BatteryThreeQuarters(props) {
    return <FaIcon {...props} type={faBatteryThreeQuarters} />;
  },

  BatteryHalf(props) {
    return <FaIcon {...props} type={faBatteryHalf} />;
  },

  BatteryQuarter(props) {
    return <FaIcon {...props} type={faBatteryQuarter} />;
  },

  BatteryEmpty(props) {
    return <FaIcon {...props} type={faBatteryEmpty} />;
  },

  Bolt(props) {
    return <FaIcon {...props} type={faBolt} />;
  },

  Bold(props) {
    return <FaIcon {...props} type={faBold} />;
  },

  SimCard(props) {
    return <FaIcon {...props} type={faSimCard} />;
  },

  CaretDown(props) {
    return <FaIcon {...props} type={faCaretDown} />;
  },

  Circle(props) {
    return <FaIcon {...props} type={faCircle} />;
  },

  CircleDot(props) {
    return <FaIcon {...props} type={faCircleDot} />;
  },

  CircleUser(props) {
    return <FaIcon {...props} type={faCircleUser} />;
  },

  Checkbox(props: IconProps & { filled?: boolean }) {
    const { filled = true } = props;
    return (
      <FaIcon {...props} type={filled ? faCheckSquareSolid : faCheckSquare} />
    );
  },

  Checkmark(props) {
    const { color, style = {} } = props;
    const theme = useTheme();
    return (
      <StyledSvgIcon
        aria-hidden="true"
        role="img"
        width="100"
        height="100"
        viewBox="0 0 100 100"
        style={{
          color: iconColor(theme, color),
          ...style,
        }}
      >
        <path d="M89.7038 10.1045C88.2094 8.40006 85.759 8.40006 84.2646 10.1045L39.0198 61.5065L15.719 34.8471C14.2245 33.1364 11.7906 33.1364 10.2852 34.8471L2.12082 44.1186C0.626395 45.8105 0.626395 48.5951 2.12082 50.2996L36.2782 89.3708C37.7727 91.0628 40.2066 91.0628 41.7175 89.3708L97.8627 25.5632C99.3791 23.8587 99.3791 21.0679 97.8627 19.3572L89.7038 10.1045Z" />
      </StyledSvgIcon>
    );
  },

  ChevronCircleDown(props) {
    return <FaIcon {...props} type={faChevronCircleDown} />;
  },

  ChevronCircleUp(props) {
    return <FaIcon {...props} type={faChevronCircleUp} />;
  },

  ChevronDown(props) {
    return <FaIcon {...props} type={faChevronDown} />;
  },

  ChevronUp(props) {
    return <FaIcon {...props} type={faChevronUp} />;
  },

  ChevronRight(props) {
    return <FaIcon {...props} type={faChevronRight} />;
  },

  ChevronLeft(props) {
    return <FaIcon {...props} type={faChevronLeft} />;
  },

  Closed(props) {
    return <FaIcon {...props} type={faMinusCircle} />;
  },

  Contrast(props) {
    return <FaIcon {...props} type={faCircleHalfStroke} />;
  },

  Copy(props) {
    return <FaIcon {...props} type={faCopy} />;
  },

  Danger(props) {
    return <FaIcon {...props} type={faExclamationCircle} />;
  },

  Delete(props) {
    return <FaIcon {...props} type={faXmarkCircle} />;
  },

  Disabled(props) {
    return <FaIcon {...props} type={faBan} />;
  },

  Display(props) {
    return <FaIcon {...props} type={faDisplay} />;
  },

  Done(props) {
    return <FaIcon {...props} type={faCheckCircle} />;
  },

  DoorClosed(props) {
    return <FaIcon {...props} type={faDoorClosed} />;
  },

  DoorOpen(props) {
    return <FaIcon {...props} type={faDoorOpen} />;
  },

  DownCircle(props) {
    return <FaIcon {...props} type={faCircleDown} />;
  },

  Edit(props) {
    return <FaIcon {...props} type={faPencil} />;
  },

  Eject(props) {
    return <FaIcon {...props} type={faEject} />;
  },

  Envelope(props) {
    return <FaIcon {...props} type={faEnvelope} />;
  },

  Export(props) {
    return <FaIcon {...props} type={faFileArrowDown} />;
  },

  Eye(props) {
    return <FaIcon {...props} type={faEye} />;
  },

  EyeSlash(props) {
    return <FaIcon {...props} type={faEyeSlash} />;
  },

  File(props) {
    return <FaIcon {...props} type={faFile} />;
  },

  Flag(props) {
    return <FaIcon {...props} type={faFlag} />;
  },

  Globe(props) {
    return <FaIcon {...props} type={faEarthAmericas} />;
  },

  HardDrive(props) {
    return <FaIcon {...props} type={faHardDrive} />;
  },

  IdCard(props) {
    return <FaIcon {...props} type={faIdCard} />;
  },

  Image(props) {
    return <FaIcon {...props} type={faImage} />;
  },

  Import(props) {
    return <FaIcon {...props} type={faFileArrowUp} />;
  },

  Info(props) {
    return <FaIcon {...props} type={faInfoCircle} />;
  },

  Italic(props) {
    return <FaIcon {...props} type={faItalic} />;
  },

  Keyboard(props) {
    return <FaIcon {...props} type={faKeyboard} />;
  },

  Language(props) {
    return <FaIcon {...props} type={faLanguage} />;
  },

  LinesVertical(props) {
    return <FaIcon {...props} type={faGripLinesVertical} />;
  },

  LinesHorizontal(props) {
    return <FaIcon {...props} type={faGripLines} />;
  },

  ListOrdered(props) {
    return <FaIcon {...props} type={faListOl} />;
  },

  ListUnordered(props) {
    return <FaIcon {...props} type={faListUl} />;
  },

  Loading(props) {
    return <FaIcon {...props} type={faSpinner} pulse spin />;
  },

  Lock(props) {
    return <FaIcon {...props} type={faLock} />;
  },

  LogOut(props) {
    return <FaIcon {...props} type={faArrowRightFromBracket} />;
  },

  Mouse(props) {
    return <FaIcon {...props} type={faMouse} />;
  },

  Next(props) {
    return <FaIcon {...props} type={faCircleRight} />;
  },

  Paused(props) {
    return <FaIcon {...props} type={faPauseCircle} />;
  },

  Previous(props) {
    return <FaIcon {...props} type={faCircleLeft} />;
  },

  Play(props) {
    return <FaIcon {...props} type={faPlay} />;
  },

  Pause(props) {
    return <FaIcon {...props} type={faPause} />;
  },

  Print(props) {
    return <FaIcon {...props} type={faPrint} />;
  },

  PowerOff(props) {
    return <FaIcon {...props} type={faPowerOff} />;
  },

  QrCode(props) {
    return <FaIcon {...props} type={faQrcode} />;
  },

  Question(props) {
    return <FaIcon {...props} type={faCircleQuestion} />;
  },

  Rotate(props) {
    return <FaIcon {...props} type={faRotate} />;
  },

  RotateRight(props) {
    return <FaIcon {...props} type={faRotateRight} />;
  },

  Save(props) {
    return <FaIcon {...props} type={faFloppyDisk} />;
  },

  Search(props) {
    return <FaIcon {...props} type={faMagnifyingGlass} />;
  },

  Settings(props) {
    return <FaIcon {...props} type={faGear} />;
  },

  Sort(props) {
    return <FaIcon {...props} type={faSort} />;
  },

  SortUp(props) {
    return <FaIcon {...props} type={faSortUp} />;
  },

  SortDown(props) {
    return <FaIcon {...props} type={faSortDown} />;
  },

  SoundOff(props) {
    return <FaIcon {...props} type={faVolumeXmark} />;
  },

  SoundOn(props) {
    return <FaIcon {...props} type={faVolumeHigh} />;
  },

  Square(props) {
    return <FaIcon {...props} type={faSquare} />;
  },

  Strikethrough(props) {
    return <FaIcon {...props} type={faStrikethrough} />;
  },

  Table(props) {
    return <FaIcon {...props} type={faTable} />;
  },

  TextSize(props) {
    return <FaIcon {...props} type={faTextHeight} />;
  },

  Trash(props) {
    return <FaIcon {...props} type={faTrash} />;
  },

  Underline(props) {
    return <FaIcon {...props} type={faUnderline} />;
  },

  UpCircle(props) {
    return <FaIcon {...props} type={faCircleUp} />;
  },

  UsbDrive(props) {
    return <FaIcon {...props} type={faUsb} />;
  },

  VolumeMute(props) {
    return <FaIcon {...props} type={faVolumeMute} />;
  },

  VolumeUp(props) {
    return <FaIcon {...props} type={faVolumeUp} />;
  },

  Warning(props) {
    return <FaIcon {...props} type={faExclamationTriangle} />;
  },

  X(props) {
    return <FaIcon {...props} type={faXmark} />;
  },

  ZoomIn(props) {
    return <FaIcon {...props} type={faMagnifyingGlassPlus} />;
  },

  ZoomOut(props) {
    return <FaIcon {...props} type={faMagnifyingGlassMinus} />;
  },
} satisfies Record<string, IconComponent>;

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
 * Sample Usage:
 * ```
 * <FullScreenIconWrapper>
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
