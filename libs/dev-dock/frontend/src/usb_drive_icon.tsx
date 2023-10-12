import { Colors } from './colors';

export function UsbDriveIcon({
  isInserted,
  disabled,
}: {
  isInserted: boolean;
  disabled: boolean;
}): JSX.Element {
  const stroke = disabled
    ? Colors.DISABLED
    : isInserted
    ? Colors.ACTIVE
    : Colors.TEXT;
  const fill = 'none'; // Not using fill currently
  return (
    <svg
      width="45"
      height="92"
      viewBox="0 0 45 92"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 6H16V10H20V6Z" fill={stroke} />
      <path d="M25 6H29V10H25V6Z" fill={stroke} />
      <path
        d="M22 28L26.3301 35.5H23V63.0858L28.5 57.5858V53.8551C27.0543 53.4248 26 52.0855 26 50.5C26 48.567 27.567 47 29.5 47C31.433 47 33 48.567 33 50.5C33 52.0855 31.9457 53.4248 30.5 53.8551V58.4142L23 65.9142V71.1C25.2822 71.5633 27 73.5811 27 76C27 78.7614 24.7614 81 22 81C19.2386 81 17 78.7614 17 76C17 73.5811 18.7178 71.5633 21 71.1V61.3802L13 52.3802V46H11V40H17V46H15V51.6198L21 58.3698V35.5H17.6699L22 28Z"
        fill={stroke}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M37 18H45V77C45 85.2843 38.2843 92 30 92H15C6.71573 92 0 85.2843 0 77V18H8V0H37V18ZM11 18V3H34V18H11ZM3 21H42V77C42 83.6274 36.6274 89 30 89H15C8.37258 89 3 83.6274 3 77V21Z"
        fill={stroke}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M42 77V21H3V77C3 83.6274 8.37258 89 15 89H30C36.6274 89 42 83.6274 42 77ZM22 28L26.3301 35.5H23V63.0858L28.5 57.5858V53.8551C27.0543 53.4248 26 52.0855 26 50.5C26 48.567 27.567 47 29.5 47C31.433 47 33 48.567 33 50.5C33 52.0855 31.9457 53.4248 30.5 53.8551V58.4142L23 65.9142V71.1C25.2822 71.5633 27 73.5811 27 76C27 78.7614 24.7614 81 22 81C19.2386 81 17 78.7614 17 76C17 73.5811 18.7178 71.5633 21 71.1V61.3802L13 52.3802V46H11V40H17V46H15V51.6198L21 58.3698V35.5H17.6699L22 28Z"
        fill={fill}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 3V18H34V3H11ZM20 6H16V10H20V6ZM25 6H29V10H25V6Z"
        fill={fill}
      />
    </svg>
  );
}
