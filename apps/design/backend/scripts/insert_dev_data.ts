import { resolve } from 'node:path';
import { loadEnvVarsFromDotenvFiles } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { BaseLogger, LogSource } from '@votingworks/logging';

import { DEV_USER_ID } from '../src/auth0_client';
import { NODE_ENV, votingWorksOrganizationId, WORKSPACE } from '../src/globals';
import { Organization, StateCodes } from '../src/types';
import { createWorkspace } from '../src/workspace';

/**
 * Inserts the dev user needed when using AUTH_ENABLED=FALSE to bypass Auth0 in development as well
 * a representative set of dev jurisdictions covering all state codes.
 */
async function main(): Promise<void> {
  loadEnvVarsFromDotenvFiles();

  if (NODE_ENV !== 'development') {
    console.log('ℹ️  Dev data insertion can only be performed in development');
    process.exit(0);
  }

  const workspace = createWorkspace(
    resolve(assertDefined(WORKSPACE)),
    new BaseLogger(LogSource.VxDesignService)
  );

  const organizations = await workspace.store.listOrganizations();
  let votingWorksOrganization: Organization | undefined = organizations.find(
    (o) => o.name === 'VotingWorks'
  );
  if (!votingWorksOrganization) {
    votingWorksOrganization = {
      id: votingWorksOrganizationId(),
      name: 'VotingWorks',
    };
    await workspace.store.createOrganization(votingWorksOrganization);
    console.log(
      `✅ VotingWorks organization created: ${votingWorksOrganization.id}`
    );
  } else {
    console.log(
      `ℹ️  VotingWorks organization already exists: ${votingWorksOrganization.id}`
    );
  }

  const devUser = await workspace.store.getUser(DEV_USER_ID);
  if (!devUser) {
    await workspace.store.createUser({
      id: DEV_USER_ID,
      type: 'support_user',
      name: 'dev-user@voting.works',
      organization: votingWorksOrganization,
    });
    console.log('✅ Dev user created');
  } else {
    console.log('ℹ️  Dev user already exists');
  }

  const jurisdictions = await workspace.store.listJurisdictions();
  for (const stateCode of StateCodes) {
    let jurisdictionWithStateCode = jurisdictions.find(
      (j) => j.stateCode === stateCode
    );
    if (!jurisdictionWithStateCode) {
      jurisdictionWithStateCode = {
        id: `dev-jurisdiction-${stateCode}`,
        name: `Dev Jurisdiction - ${stateCode}`,
        stateCode,
        organization: votingWorksOrganization,
      };
      await workspace.store.createJurisdiction(jurisdictionWithStateCode);
      console.log(
        `✅ Jurisdiction with state code ${stateCode} created: ${jurisdictionWithStateCode.name}`
      );
    } else {
      console.log(
        `ℹ️  Jurisdiction with state code ${stateCode} already exists: ${jurisdictionWithStateCode.name}`
      );
    }
  }

  console.log('------------------------------');
  console.log('✅ Dev data insertion complete');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
