import { Admin } from '@votingworks/api';
import { BallotLocale, ElectionDefinition } from '@votingworks/types';
import { BallotConfig } from '@votingworks/utils';
import { DEFAULT_LOCALE } from '../config/globals';
import { getBallotPath, getBallotStylesDataByStyle } from './election';

export function getAllBallotConfigs(
  electionDefinition: ElectionDefinition,
  localeCodes: readonly string[]
): BallotConfig[] {
  const { election } = electionDefinition;
  const ballotStyles = getBallotStylesDataByStyle(election);
  const allLocaleConfigs = localeCodes.map<BallotLocale>((localeCode) => ({
    primary: DEFAULT_LOCALE,
    secondary: localeCode !== DEFAULT_LOCALE ? localeCode : undefined,
  }));

  return ballotStyles.flatMap((ballotStyle) =>
    allLocaleConfigs.flatMap((locales) =>
      [true, false].flatMap<BallotConfig>((isAbsentee) =>
        [true, false].flatMap<BallotConfig>((isLiveMode) => ({
          ballotStyleId: ballotStyle.ballotStyleId,
          precinctId: ballotStyle.precinctId,
          contestIds: ballotStyle.contestIds,
          isLiveMode,
          isAbsentee,
          locales,
          filename: getBallotPath({
            ...ballotStyle,
            electionDefinition,
            locales,
            ballotMode: isLiveMode
              ? Admin.BallotMode.Official
              : Admin.BallotMode.Test,
            isAbsentee,
          }),
          layoutFilename: getBallotPath({
            ...ballotStyle,
            electionDefinition,
            locales,
            ballotMode: isLiveMode
              ? Admin.BallotMode.Official
              : Admin.BallotMode.Test,
            isAbsentee,
            variant: 'layout',
            extension: '.json',
          }),
        }))
      )
    )
  );
}
