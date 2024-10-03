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
  BallotStyleGroup,
  Party,
} from '@votingworks/types';

const ID_LANGUAGES_SEPARATOR = '_';
const GROUP_ID_PARTS_SEPARATOR = '-';

export function generateBallotStyleGroupId(params: {
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
  return [generateBallotStyleGroupId(params), ...params.languages].join(
    ID_LANGUAGES_SEPARATOR
  ) as BallotStyleId;
}

function getBallotStyleGroupMap(
  ballotStyles: readonly BallotStyle[]
): Map<BallotStyleGroupId, Set<BallotStyle>> {
  return iter(ballotStyles).toMap((b) => b.groupId);
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

  const ballotStyleGroups = getBallotStyleGroupMap(ballotStyles);
  const matchingGroup = assertDefined(
    ballotStyleGroups.get(sourceBallotStyle.groupId)
  );

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
  const ballotStyleGroups = getBallotStyleGroupMap(ballotStyles);

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

export function getGroupedBallotStyles(
  ballotStyles: readonly BallotStyle[]
): BallotStyleGroup[] {
  const ballotStylesByGroupId = getBallotStyleGroupMap(ballotStyles);
  return iter(ballotStylesByGroupId.keys())
    .map((groupId) => {
      const ballotStyleGroup = assertDefined(
        ballotStylesByGroupId.get(groupId)
      );
      let englishBallotStyle: BallotStyle | undefined;
      let legacyBallotStyle: BallotStyle | undefined;

      for (const ballotStyle of ballotStyleGroup) {
        if (deepEqual(ballotStyle.languages, [LanguageCode.ENGLISH])) {
          englishBallotStyle = ballotStyle;
        } else if (!ballotStyle.languages) {
          legacyBallotStyle = ballotStyle;
        }
      }

      const defaultBallotStyleInfo = assertDefined(
        englishBallotStyle || legacyBallotStyle,
        'Expected at least one English language ballot style per ballot style group.'
      );
      return {
        ...defaultBallotStyleInfo,
        id: groupId,
        ballotStyles: Array.from(ballotStyleGroup),
      };
    })
    .toArray();
}
