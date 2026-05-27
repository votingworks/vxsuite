import React from 'react';
import { splitBallotLineBreaks } from '@votingworks/utils';

/**
 * Renders a ballot data string (e.g. `contest.title` or `candidate.name`)
 * with `<br/>` markers in the source converted to real line breaks. Ballot
 * fixtures sometimes embed `<br/>` to control where labels wrap on the
 * physical ballot, so any UI rendering those raw strings would otherwise
 * show the markers literally.
 */
export function BallotText({ text }: { text: string }): JSX.Element {
  const lines = splitBallotLineBreaks(text);
  return (
    <React.Fragment>
      {lines.map((line, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}
