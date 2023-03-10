/* eslint-disable no-console */
import { JavaCard } from '../src/java_card';
import { constructDevJavaCardConfig } from '../src/java_card_config';
import { waitForReadyCardStatus } from './utils';

const initialJavaCardConfigurationScriptReminder = `
Have you run \`./scripts/configure-dev-java-card\` on this card yet?
If not, that's likely the cause of this error.
Run that and then retry.
`;

async function programDevSystemAdministratorJavaCard(): Promise<void> {
  const card = new JavaCard(
    constructDevJavaCardConfig({
      includeCardProgrammingConfig: true,
      pathToAuthLibRoot: '.',
    })
  );
  await waitForReadyCardStatus(card);
  try {
    await card.program({
      user: { role: 'system_administrator' },
      pin: '000000',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '';
    throw new Error(
      `${errorMessage}\n${initialJavaCardConfigurationScriptReminder}`
    );
  }
}

/**
 * A script for programming a dev system administrator Java Card to bootstrap local development
 * with real smart cards. Once you have your first system administrator card, you can program all
 * other cards, including additional system administrator cards, through the VxAdmin UI.
 */
export async function main(): Promise<void> {
  try {
    await programDevSystemAdministratorJavaCard();
  } catch (error) {
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  console.log('✅ Done!');
  process.exit(0);
}
