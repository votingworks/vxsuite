/**
 * Ballot data fields (contest titles, candidate names) may include `<br>` /
 * `<br/>` markers that the ballot template renders as visual line breaks.
 * Splits the input on those markers so report renderers can render the
 * segments however they need to (e.g. with JSX `<br />` for PDF/UI or joined
 * with a space for CSV).
 */
export function splitBallotLineBreaks(input: string): string[] {
  return input.split(/<br\s*\/?>/i);
}

/**
 * Same as {@link splitBallotLineBreaks} but joins the segments back together
 * with a single space, suitable for plain-text contexts like CSV exports.
 */
export function flattenBallotLineBreaks(input: string): string {
  return splitBallotLineBreaks(input).join(' ');
}
