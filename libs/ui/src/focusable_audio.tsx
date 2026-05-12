import styled from 'styled-components';

import { ComponentPropsWithoutRef, ElementType } from 'react';
import { ReadOnLoad } from './ui_strings/read_on_load';

export const FOCUSABLE_AUDIO_CLASS_NAME = 'FocusableAudio';

export type FocusableAudioProps<T extends ElementType> = Omit<
  ComponentPropsWithoutRef<T>,
  'as'
> & {
  as?: T;
  readOnLoad?: boolean;
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
 * NOTE: This is not yet fully ready for use with audio-only blocks, since they
 * are rendered off-screen and won't have a visible focus indicator. We need to
 * think through how to indicate to controller-and-video voters that the focus
 * is currently on an audio-only element.
 */
export function FocusableAudio<T extends ElementType = 'div'>(
  props: FocusableAudioProps<T>
): JSX.Element {
  const { as = 'div', children, className, readOnLoad, ...rest } = props;

  const Container = readOnLoad ? ReadOnLoad : DefaultContainer;

  return (
    <Container
      {...rest}
      as={as}
      className={`${className || ''} ${FOCUSABLE_AUDIO_CLASS_NAME}`}
      tabIndex={0}
    >
      {children}
    </Container>
  );
}
