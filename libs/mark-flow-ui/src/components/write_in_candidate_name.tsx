import { assertDefined } from '@votingworks/basics';
import {
  SPACE_BAR_KEY,
  US_ENGLISH_KEYMAP,
  virtualKeyboardCommon,
  VirtualKeyboardLabel,
} from '@votingworks/ui';
import React from 'react';

interface WriteInCandidateNameProps {
  name: string;
}

export const LETTER_KEYS: { [char: string]: virtualKeyboardCommon.Key } =
  (() => {
    const keys = US_ENGLISH_KEYMAP.rows.flatMap((row) =>
      row.map((key) => [key.value, key])
    );

    keys.push([SPACE_BAR_KEY.value, SPACE_BAR_KEY]);

    return Object.fromEntries(keys);
  })();

/**
 * Renders a screen-reader comptible series of letters representing the given
 * write-in candidate name.
 */
export function WriteInCandidateName(
  props: WriteInCandidateNameProps
): JSX.Element {
  const { name } = props;

  const letters: React.ReactNode[] = [];
  for (let i = 0; i < name.length; i += 1) {
    const char = name[i];
    letters.push(
      <VirtualKeyboardLabel
        config={assertDefined(LETTER_KEYS[char])}
        key={`${i}-${char}`}
      />
    );
  }

  return <span>{letters}</span>;
}
