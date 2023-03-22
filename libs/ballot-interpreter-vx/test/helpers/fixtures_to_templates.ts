import { iter } from '@votingworks/basics';
import {
  BallotPageLayoutWithImage,
  ElectionDefinition,
} from '@votingworks/types';
import { Interpreter } from '../../src';
import { interpretMultiPageTemplate } from '../../src/layout';
import { Fixture } from '../fixtures';

export async function* fixturesToTemplates({
  electionDefinition,
  fixtures,
  useFixtureMetadata = true,
}: {
  electionDefinition: ElectionDefinition;
  fixtures: readonly [Fixture, ...Fixture[]];
  useFixtureMetadata?: boolean;
}): AsyncGenerator<BallotPageLayoutWithImage> {
  yield* interpretMultiPageTemplate({
    electionDefinition,
    pages: iter(fixtures)
      .async()
      .enumerate()
      .map(async ([i, page]) => ({
        pageCount: 2,
        pageNumber: i + 1,
        page: await page.imageData(),
      })),
    metadata: useFixtureMetadata ? await fixtures[0].metadata() : undefined,
  });
}

export async function buildInterpreterWithFixtures({
  electionDefinition,
  fixtures,
  useFixtureMetadata = true,
}: {
  electionDefinition: ElectionDefinition;
  fixtures: readonly [Fixture, ...Fixture[]];
  useFixtureMetadata?: boolean;
}): Promise<Interpreter> {
  const interpreter = new Interpreter({ electionDefinition });
  for await (const template of fixturesToTemplates({
    electionDefinition,
    fixtures,
    useFixtureMetadata,
  })) {
    interpreter.addTemplate(template);
  }
  return interpreter;
}
