import { extractErrorMessage } from '@votingworks/basics';
import { existsSync } from 'fs';

import { CARD_VX_ADMIN_CERT, JavaCard } from '../src/java_card';
import { waitForReadyCardStatus } from './utils';

const GLOBAL_PLATFORM_JAR_FILE_PATH = 'scripts/gp.jar';

function sectionLog(symbol: string, message: string): void {
  console.log('-'.repeat(3 + message.length));
  console.log(`${symbol} ${message}`);
  console.log('-'.repeat(3 + message.length));
}

function checkForScriptDependencies(): void {
  if (!existsSync(GLOBAL_PLATFORM_JAR_FILE_PATH)) {
    throw new Error(
      'Missing script dependencies; install using `make install-script-dependencies`'
    );
  }
}

/**
 * An initial Java Card configuration script to be run at the Bakery
 */
export async function main(): Promise<void> {
  try {
    checkForScriptDependencies();
    const card = new JavaCard();
    await waitForReadyCardStatus(card);
    console.log('CERT', await card.retrieveCert(CARD_VX_ADMIN_CERT.OBJECT_ID));
    const result = await card.checkPin('77777777');
    // const result = await card.checkPin('757287');
    console.log(`PIN? ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
  sectionLog('✅', 'Done!');
  process.exit(0);
}
