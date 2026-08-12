import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircle,
  faCircleDot,
  faCopy,
  faEye,
  faPauseCircle,
  faSquareMinus,
  faSquare,
  faXmarkCircle,
  faCheckSquare,
} from '@fortawesome/free-regular-svg-icons';
import {
  faCheckCircle,
  faCircleHalfStroke,
  faCircleLeft,
  faCircleRight,
  faDeleteLeft,
  faDisplay,
  faExclamationCircle,
  faExclamationTriangle,
  faFile,
  faFloppyDisk,
  faGear,
  faBan,
  faCheckSquare as faCheckSquareSolid,
  faCircle as faCircleSolid,
  faSquare as faSquareSolid,
  faChevronCircleUp,
  faChevronCircleDown,
  faChevronRight,
  faChevronLeft,
  faCaretDown,
  faCirclePlus,
  faCircleQuestion,
  faEject,
  faDownload,
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
  faPenToSquare,
  faPlay,
  faPowerOff,
  faPrint,
  faRotateRight,
  faSimCard,
  faSitemap,
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
  faTrashCan,
  faUnderline,
  faVolumeHigh,
  faVolumeMute,
  faVolumeUp,
  faVolumeXmark,
  faXmark,
  faCircleUser,
  faArrowRightArrowLeft,
  faArrowRightFromBracket,
  faArrowsSplitUpAndLeft,
  faChartLine,
  faPlus,
  faMinus,
  faVolumeDown,
  faClock,
  faHeadphones,
} from '@fortawesome/free-solid-svg-icons';
import { faUsb } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import styled, { useTheme } from 'styled-components';

import { assert } from '@votingworks/basics';
import { UiTheme } from '@votingworks/types';
import { ScreenInfo, useScreenInfo } from './hooks/use_screen_info';
import { Font, FontProps } from './typography';
import { FONT_AWESOME_INLINE_SVG_CLASS_NAME } from './fonts/font_awesome_class_names';

export const ICON_COLORS = [
  'neutral',
  'neutralMuted',
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
  className?: string;
  color?: IconColor;
  fixedWidth?: boolean;
  style?: React.CSSProperties;
}

export type IconComponent = (props: IconProps) => JSX.Element;

interface InnerProps extends IconProps {
  flipInRtlMode: boolean;
  pulse?: boolean;
  spin?: boolean;
  type: IconDefinition;
}

/**
 * For all icons assigned the `flipInRtlMode` prop, a CSS transform in global_styles.tsx
 * horizontally flips the icon when an RTL language is in use. See global_styles.tsx for more
 * details.
 */
export const ICON_FLIP_IN_RTL_MODE_CLASS_NAME = 'icon--flip-in-rtl-mode';

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
    neutralMuted: colors.onBackgroundMuted,
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
  const {
    className,
    pulse,
    spin,
    type,
    color,
    fixedWidth,
    flipInRtlMode,
    style = {},
  } = props;
  const theme = useTheme();

  /**
   * For icons with warning coloring in the default voter-facing color mode, we use custom two-tone
   * SVGs with a black border/text and a yellow interior. VVSG2 requires that we use yellow/orange
   * for warning iconography, but to meet the required 10:1 contrast ratio on a white background,
   * yellow/orange has to be darkened, enough that it becomes brown. The white background and
   * two-tone SVGs' black border have a 10:1 contrast ratio as do the SVGs' black border and yellow
   * interior.
   *
   * TODO: Can we dynamically add black borders so that we don't have to create custom SVGs?
   */
  if (theme.colorMode === 'contrastMedium' && color === 'warning') {
    assert(!pulse && !spin, 'Custom SVGs do not support pulse or spin');
    switch (type) {
      case faExclamationTriangle: {
        return (
          <StyledSvgIcon
            aria-hidden="true"
            className={FONT_AWESOME_INLINE_SVG_CLASS_NAME}
            data-icon={type.iconName}
            role="img"
            height="100"
            width="100"
            viewBox="0 0 512 512"
            style={{ color: theme.colors.onBackground, ...style }}
          >
            {/* Triangle with rounded corners */}
            <path
              fill={iconColor(theme, color)}
              d="M16 429.6c0 19 15.4 34.4 34.4 34.4l411.2 0c19 0 34.4-15.4 34.4-34.4c0-6.1-1.6-12.1-4.7-17.3L290.3 67.7C283.2 55.5 270.1 48 256 48s-27.2 7.5-34.3 19.7L20.7 412.3c-3.1 5.3-4.7 11.2-4.7 17.3z"
            />
            {/* Outside border */}
            <path d="M20.7 412.3c-3.1 5.3-4.7 11.2-4.7 17.3c0 19 15.4 34.4 34.4 34.4l411.2 0c19 0 34.4-15.4 34.4-34.4c0-6.1-1.6-12.1-4.7-17.3L290.3 67.7C283.2 55.5 270.1 48 256 48s-27.2 7.5-34.3 19.7L20.7 412.3zM6.9 404.2l201-344.6C217.9 42.5 236.2 32 256 32s38.1 10.5 48.1 27.6l201 344.6c4.5 7.7 6.9 16.5 6.9 25.4c0 27.8-22.6 50.4-50.4 50.4L50.4 480C22.6 480 0 457.4 0 429.6c0-8.9 2.4-17.7 6.9-25.4z" />
            {/* Exclamation mark line */}
            <path d="M232 184c0-13.3 10.7-24 24-24s24 10.7 24 24v112c0 13.3-10.7 24-24 24s-24-10.7-24-24V184z" />
            {/* Exclamation mark dot */}
            <path d="M256 416a32 32 0 1 0 0-64 32 32 0 1 0 0 64z" />
          </StyledSvgIcon>
        );
      }
      default: {
        throw new Error(
          `Icon ${type.iconName} with warning coloring in the default voter-facing color mode ` +
            'requires a custom SVG to ensure that contrast requirements are met'
        );
      }
    }
  }

  return (
    <FontAwesomeIcon
      className={[
        flipInRtlMode ? ICON_FLIP_IN_RTL_MODE_CLASS_NAME : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      icon={type}
      spin={spin}
      pulse={pulse}
      fixedWidth={fixedWidth}
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
    return <FaIcon {...props} flipInRtlMode={false} type={faCirclePlus} />;
  },

  Antenna(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faTowerBroadcast} />;
  },

  Backspace(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faDeleteLeft} />;
  },

  BatteryFull(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBatteryFull} />;
  },

  BatteryThreeQuarters(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faBatteryThreeQuarters} />
    );
  },

  BatteryHalf(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBatteryHalf} />;
  },

  BatteryQuarter(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBatteryQuarter} />;
  },

  BatteryEmpty(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBatteryEmpty} />;
  },

  Bolt(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBolt} />;
  },

  Bold(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBold} />;
  },

  Cancel(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faXmarkCircle} />;
  },

  CaretDown(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCaretDown} />;
  },

  Circle(props: IconProps & { filled?: boolean }) {
    const { filled = false } = props;
    return (
      <FaIcon
        {...props}
        flipInRtlMode={false}
        type={filled ? faCircleSolid : faCircle}
      />
    );
  },

  CircleSolid(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCircleSolid} />;
  },

  CircleDot(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCircleDot} />;
  },

  CircleUser(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCircleUser} />;
  },

  ChartLine(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faChartLine} />;
  },

  Checkbox(props: IconProps & { filled?: boolean }) {
    const { filled = true } = props;
    return (
      <FaIcon
        {...props}
        flipInRtlMode={false}
        type={filled ? faCheckSquareSolid : faCheckSquare}
      />
    );
  },

  CheckboxPartial(props: IconProps) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSquareMinus} />;
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
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faChevronCircleDown} />
    );
  },

  ChevronCircleUp(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faChevronCircleUp} />;
  },

  ChevronDown(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faChevronDown} />;
  },

  ChevronUp(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faChevronUp} />;
  },

  ChevronRight(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faChevronRight} />;
  },

  ChevronLeft(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faChevronLeft} />;
  },

  Clock(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faClock} />;
  },

  Closed(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faMinusCircle} />;
  },

  Contrast(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faCircleHalfStroke} />
    );
  },

  Copy(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCopy} />;
  },

  Crossover(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faArrowRightArrowLeft} />
    );
  },

  Danger(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faExclamationCircle} />
    );
  },

  Delete(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faXmarkCircle} />;
  },

  Disabled(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faBan} />;
  },

  Display(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faDisplay} />;
  },

  Done(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCheckCircle} />;
  },

  Download(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faDownload} />;
  },

  Edit(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPencil} />;
  },

  Eject(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faEject} />;
  },

  Envelope(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faEnvelope} />;
  },

  Export(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faFileArrowDown} />;
  },

  Eye(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faEye} />;
  },

  EyeSlash(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faEyeSlash} />;
  },

  File(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faFile} />;
  },

  Flag(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faFlag} />;
  },

  Globe(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faEarthAmericas} />;
  },

  HardDrive(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faHardDrive} />;
  },

  Headphones(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faHeadphones} />;
  },

  IdCard(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faIdCard} />;
  },

  Image(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faImage} />;
  },

  Import(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faFileArrowUp} />;
  },

  Info(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faInfoCircle} />;
  },

  Italic(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faItalic} />;
  },

  Language(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faLanguage} />;
  },

  LinesVertical(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faGripLinesVertical} />
    );
  },

  LinesHorizontal(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faGripLines} />;
  },

  ListOrdered(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faListOl} />;
  },

  ListUnordered(props) {
    return <FaIcon {...props} flipInRtlMode type={faListUl} />;
  },

  Loading(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faSpinner} pulse spin />
    );
  },

  Lock(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faLock} />;
  },

  LogOut(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faArrowRightFromBracket} />
    );
  },

  Minus(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faMinus} />;
  },

  Mouse(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faMouse} />;
  },

  Next(props) {
    return <FaIcon {...props} flipInRtlMode type={faCircleRight} />;
  },

  Paused(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPauseCircle} />;
  },

  Plus(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPlus} />;
  },

  Previous(props) {
    return <FaIcon {...props} flipInRtlMode type={faCircleLeft} />;
  },

  Play(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPlay} />;
  },

  Pause(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPause} />;
  },

  PenToSquare(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPenToSquare} />;
  },

  Print(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPrint} />;
  },

  PowerOff(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faPowerOff} />;
  },

  Question(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faCircleQuestion} />;
  },

  Rotate(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faRotate} />;
  },

  RotateRight(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faRotateRight} />;
  },

  Save(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faFloppyDisk} />;
  },

  Search(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faMagnifyingGlass} />;
  },

  Settings(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faGear} />;
  },

  SimCard(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSimCard} />;
  },

  Sitemap(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSitemap} />;
  },

  Sort(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSort} />;
  },

  SortUp(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSortUp} />;
  },

  SortDown(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSortDown} />;
  },

  SoundOff(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faVolumeXmark} />;
  },

  SoundOn(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faVolumeHigh} />;
  },

  Split(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faArrowsSplitUpAndLeft} />
    );
  },

  Square(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSquare} />;
  },

  SquareSolid(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faSquareSolid} />;
  },

  Strikethrough(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faStrikethrough} />;
  },

  Table(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faTable} />;
  },

  TextSize(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faTextHeight} />;
  },

  Trash(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faTrashCan} />;
  },

  Underline(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faUnderline} />;
  },

  UsbDrive(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faUsb} />;
  },

  VolumeDown(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faVolumeDown} />;
  },

  VolumeMute(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faVolumeMute} />;
  },

  VolumeUp(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faVolumeUp} />;
  },

  Warning(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faExclamationTriangle} />
    );
  },

  X(props) {
    return <FaIcon {...props} flipInRtlMode={false} type={faXmark} />;
  },

  ZoomIn(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faMagnifyingGlassPlus} />
    );
  },

  ZoomOut(props) {
    return (
      <FaIcon {...props} flipInRtlMode={false} type={faMagnifyingGlassMinus} />
    );
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
