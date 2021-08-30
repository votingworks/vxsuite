import { Election } from '@votingworks/types'
import { DEFAULT_LOCALE } from '../config/globals'
import { BallotConfig } from '../config/types'
import { getBallotPath, getBallotStylesDataByStyle } from './election'

export default function getAllBallotConfigs(
  election: Election,
  electionHash: string,
  localeCodes: readonly string[]
): readonly BallotConfig[] {
  const ballotStyles = getBallotStylesDataByStyle(election)

  return ballotStyles.flatMap((ballotStyle) =>
    localeCodes.flatMap((localeCode) =>
      [true, false].flatMap<BallotConfig>((isAbsentee) =>
        [true, false].flatMap<BallotConfig>((isLiveMode) => ({
          isLiveMode,
          isAbsentee,
          ballotStyleId: ballotStyle.ballotStyleId,
          precinctId: ballotStyle.precinctId,
          contestIds: ballotStyle.contestIds,
          locales: {
            primary: DEFAULT_LOCALE,
            secondary: localeCode !== DEFAULT_LOCALE ? localeCode : undefined,
          },
          filename: getBallotPath({
            ...ballotStyle,
            isLiveMode,
            isAbsentee,
            election,
            electionHash,
            locales: {
              primary: DEFAULT_LOCALE,
              secondary: localeCode !== DEFAULT_LOCALE ? localeCode : undefined,
            },
          }),
        }))
      )
    )
  )
}
