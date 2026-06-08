import styled from 'styled-components';

import {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  useState,
} from 'react';
import { ReadOnLoad } from './ui_strings/read_on_load';

export const FOCUSABLE_AUDIO_CLASS_NAME = 'FocusableAudio';

export type FocusableAudioProps<T extends ElementType> = Omit<
  ComponentPropsWithoutRef<T>,
  'as'
> & {
  as?: T;
  readOnLoad?: boolean;

  /**
   * When `true`, displays the standard focus outline while the block is
   * focused. Defaults to `false`, which suppresses the outline.
   */
  showFocusIndicator?: boolean;
};

const DefaultContainer = styled.div`
  /* stylelint-disable no-empty-source */
`;

/**
 * Renders a screen-reader-compatible focusable block that is inserted into the
 * browser tabbing order. This allows voters to replay screen reader audio for
 * non-interactive elements, like screen titles/preambles and accessible
 * navigation instructions, by tabbing (back) to the block.
 *
 * When the `readOnLoad` flag is specified, this also takes on the behavior of
 * the {@link ReadOnLoad} component, in that it automatically takes focus when
 * it's first mounted, triggering a screen reader readout of its contents.
 *
 */
export function FocusableAudio<T extends ElementType = 'div'>(
  props: FocusableAudioProps<T>
): JSX.Element {
  const {
    as = 'div',
    children,
    className,
    readOnLoad,
    showFocusIndicator,
    style,
    ...rest
  } = props;

  // `readOnLoad` blocks grab focus automatically on mount to trigger their
  // audio readout. Suppress the focus outline for that initial programmatic
  // focus, and only enable it once focus has left the block then returned
  const [outlineEnabled, setOutlineEnabled] = useState(!readOnLoad);

  const baseStyle: CSSProperties = style ?? {};
  const showOutline = showFocusIndicator && outlineEnabled;

  const Container = readOnLoad ? ReadOnLoad : DefaultContainer;

  function handleBlur() {
    setOutlineEnabled(true);
  }

  return (
    <Container
      {...rest}
      as={as}
      className={`${className || ''} ${FOCUSABLE_AUDIO_CLASS_NAME}`}
      onBlur={handleBlur}
      // Suppress the focus outline unless explicitly enabled.
      style={showOutline ? baseStyle : { ...baseStyle, outline: 'none' }}
      tabIndex={0}
    >
      {children}
    </Container>
  );
}
