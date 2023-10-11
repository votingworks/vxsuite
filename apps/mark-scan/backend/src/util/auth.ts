import {
  InsertedSmartCardAuth,
  MockFileVxSuiteCard,
  VxSuiteJavaCard,
} from '@votingworks/auth';
import { Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';

export function getDefaultAuth(logger: Logger): InsertedSmartCardAuth {
  return new InsertedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileVxSuiteCard()
        : new VxSuiteJavaCard(),
    config: {
      allowCardlessVoterSessions: true,
      allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
    },
    logger,
  });
}
