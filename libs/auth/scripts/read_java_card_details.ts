import { extractErrorMessage } from '@votingworks/basics';

import { CardDetails } from '../src/card';
import {
  DEV_VX_CERT_AUTHORITY_CERT_PATH,
  PROD_VX_CERT_AUTHORITY_CERT_PATH,
} from '../src/config';
import { verifyFirstCertWasSignedBySecondCert } from '../src/cryptography';
import { JavaCard } from '../src/java_card';
import { waitForReadyCardStatus } from './utils';

const ENVS = ['development', 'production'] as const;

type Env = (typeof ENVS)[number];

interface ExtendedCardDetails {
  cardDetails?: CardDetails;
  env: Env;
}

const VX_CERT_AUTHORITY_CERT_PATHS: Record<Env, string> = {
  development: DEV_VX_CERT_AUTHORITY_CERT_PATH,
  production: PROD_VX_CERT_AUTHORITY_CERT_PATH,
};

async function readJavaCardDetails(): Promise<ExtendedCardDetails | undefined> {
  for (const env of ENVS) {
    const vxCertAuthorityCertPath = VX_CERT_AUTHORITY_CERT_PATHS[env];
    const card = new JavaCard({ vxCertAuthorityCertPath });
    const { cardDetails } = await waitForReadyCardStatus(card);
    if (cardDetails) {
      // Card has been run through initial Java Card configuration script and programmed for a user
      return { cardDetails, env };
    }

    try {
      const cardVxCert = await card.retrieveCertByIdentifier('cardVxCert');
      await verifyFirstCertWasSignedBySecondCert(
        cardVxCert,
        vxCertAuthorityCertPath
      );
      // Card has been run through initial Java Card configuration script but not programmed for a
      // user
      return { env };
    } catch {} /* eslint-disable-line no-empty */

    // Disconnect the card so that it can be reconnected to, through a new JavaCard instance
    await card.disconnect();
  }

  // Card has not been run through initial Java Card configuration script
  return undefined;
}

function printCardDetails(extendedCardDetails?: ExtendedCardDetails): void {
  const { cardDetails, env } = extendedCardDetails ?? {};
  const { jurisdiction, role } = cardDetails?.user ?? {};
  const electionHash =
    cardDetails?.user.role !== 'system_administrator'
      ? cardDetails?.user.electionHash
      : undefined;
  const formattedCardDetails = `
Env:           ${env ?? '-'}
Jurisdiction:  ${jurisdiction ?? '-'}
User role:     ${role ?? '-'}
Election hash: ${electionHash ?? '-'}
`;
  console.log(formattedCardDetails);
}

/**
 * A script for reading Java Card details, namely environment, jurisdiction, user role, and
 * election hash
 */
export async function main(): Promise<void> {
  try {
    printCardDetails(await readJavaCardDetails());
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
