import { Election } from '@votingworks/types';
import { BallotConfig } from '@votingworks/utils';
import { DEFAULT_LOCALE } from '../config/globals';
import { getBallotPath, getBallotStylesDataByStyle } from './election';

export function getAllBallotConfigs(
  election: Election,
  electionHash: string,
  localeCodes: readonly string[]
): readonly BallotConfig[] {
  const ballotStyles = getBallotStylesDataByStyle(election);

  return ballotStyles.flatMap((ballotStyle) =>
    localeCodes.flatMap((localeCode) =>
      [true, false].flatMap<BallotConfig>((isAbsentee) =>
        [true, false].flatMap<BallotConfig>((isLiveMode) => ({
          ballotStyleId: ballotStyle.ballotStyleId,
          precinctId: ballotStyle.precinctId,
          contestIds: ballotStyle.contestIds,
          isLiveMode,
          isAbsentee,
          locales: {
            primary: DEFAULT_LOCALE,
            secondary: localeCode !== DEFAULT_LOCALE ? localeCode : undefined,
          },
          filename: getBallotPath({
            ...ballotStyle,
            election,
            electionHash,
            locales: {
              primary: DEFAULT_LOCALE,
              secondary: localeCode !== DEFAULT_LOCALE ? localeCode : undefined,
            },
            isLiveMode,
            isAbsentee,
          }),
        }))
      )
    )
  );
}
