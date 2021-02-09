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
      [true, false].flatMap<BallotConfig>((isLiveMode) => ({
        ballotStyleId: ballotStyle.ballotStyleId,
        precinctId: ballotStyle.precinctId,
        contestIds: ballotStyle.contestIds,
        isLiveMode,
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
        }),
      }))
    )
  )
}
