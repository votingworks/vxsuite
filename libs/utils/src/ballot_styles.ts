import {
  Result,
  assertDefined,
  err,
  deepEqual,
  iter,
  ok,
} from '@votingworks/basics';
import {
  BallotStyle,
  BallotStyleGroupId,
  BallotStyleId,
  LanguageCode,
  ParentBallotStyle,
  Party,
} from '@votingworks/types';

const ID_LANGUAGES_SEPARATOR = '_';
const GROUP_ID_PARTS_SEPARATOR = '-';

function generateBallotStyleGroupId(params: {
  ballotStyleIndex: number;
  party?: Party;
}): BallotStyleGroupId {
  return params.party
    ? (`${params.ballotStyleIndex}${GROUP_ID_PARTS_SEPARATOR}${params.party.abbrev}` as BallotStyleGroupId)
    : (params.ballotStyleIndex.toString() as BallotStyleGroupId);
}

/**
 * Generates a ballot style ID based on the given parameters in the format:
 * `<index>[_<partyAbbreviation>]_<languageCode1>[_<languageCode2>...]`
 */
export function generateBallotStyleId(params: {
  ballotStyleIndex: number;
  languages: LanguageCode[];
  party?: Party;
}): BallotStyleId {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return [generateBallotStyleGroupId(params), ...params.languages].join(
    ID_LANGUAGES_SEPARATOR
  ) as BallotStyleId;
}

export function extractBallotStyleGroupId(
  ballotStyleId: BallotStyleId
): BallotStyleGroupId {
  return (ballotStyleId.split(ID_LANGUAGES_SEPARATOR)[0] ||
    ballotStyleId) as BallotStyleGroupId;
}

/**
 * Returns a mapping of language-agnostic ballot style "group" ID to list of
 * (potentially language-specific) ballot styles in that group, for the given
 * ballot style list.
 */
export function getBallotStyleGroups(
  ballotStyles: readonly BallotStyle[]
): Map<BallotStyleGroupId, Set<BallotStyle>> {
  return iter(ballotStyles).toMap((b) => extractBallotStyleGroupId(b.id));
}

/**
 * Returns a language-specific ballot style, for the given
 * {@link targetBallotStyleLanguage}, that belongs to the same
 * language-agnostic ballot style group as the given
 * {@link sourceBallotStyleId}.
 */
export function getRelatedBallotStyle(params: {
  ballotStyles: readonly BallotStyle[];
  sourceBallotStyleId: BallotStyleId;
  targetBallotStyleLanguage: LanguageCode;
}): Result<BallotStyle, string> {
  const { ballotStyles, sourceBallotStyleId, targetBallotStyleLanguage } =
    params;

  const sourceBallotStyle = ballotStyles.find(
    (b) => b.id === sourceBallotStyleId
  );
  if (!sourceBallotStyle) {
    return err(`ballot style not found: ${sourceBallotStyleId}`);
  }

  // For legacy language-agnostic ballot styles, return the same ballot style:
  if (iter(sourceBallotStyle.languages).isEmpty()) {
    return ok(sourceBallotStyle);
  }

  const ballotStyleGroups = getBallotStyleGroups(ballotStyles);
  const groupId = extractBallotStyleGroupId(sourceBallotStyleId);
  const matchingGroup = assertDefined(ballotStyleGroups.get(groupId));

  const destinationBallotStyle = iter(matchingGroup).find((b) =>
    deepEqual(b.languages, [targetBallotStyleLanguage])
  );
  if (!destinationBallotStyle) {
    return err('destination ballot style not found');
  }

  return ok(destinationBallotStyle);
}

/**
 * Returns English-language-only ballot styles from the given list.
 *
 * The returned list will include all legacy language-agnostic ballot styles as
 * well, if included in the original list.
 */
export function getDefaultLanguageBallotStyles(
  ballotStyles: readonly BallotStyle[]
): BallotStyle[] {
  const ballotStyleGroups = getBallotStyleGroups(ballotStyles);

  return iter(ballotStyleGroups.values())
    .map((ballotStyleGroup) => {
      let englishBallotStyle: BallotStyle | undefined;
      let legacyBallotStyle: BallotStyle | undefined;

      for (const ballotStyle of ballotStyleGroup) {
        if (deepEqual(ballotStyle.languages, [LanguageCode.ENGLISH])) {
          englishBallotStyle = ballotStyle;
        } else if (!ballotStyle.languages) {
          legacyBallotStyle = ballotStyle;
        }
      }

      return assertDefined(
        englishBallotStyle || legacyBallotStyle,
        'Expected at least one English language ballot style per ballot style group.'
      );
    })
    .toArray()
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Returns English-language-only ballot styles from the given list, formatted with
 * the representive language-agnotic ballot style group ID.
 *
 * The returned list will include all legacy language-agnostic ballot styles as
 * well, if included in the original list.
 *
 *
 */
export function getParentBallotStyles(
  ballotStyles: readonly BallotStyle[]
): ParentBallotStyle[] {
  return getDefaultLanguageBallotStyles(ballotStyles).map((bs) => ({
    ...bs,
    id: extractBallotStyleGroupId(bs.id),
  }));
}
