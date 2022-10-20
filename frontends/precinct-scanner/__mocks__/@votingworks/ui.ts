// eslint-disable-next-line import/no-extraneous-dependencies, import/no-import-module-exports
import {
  fakePrintElementWhenReady,
  fakePrintElement,
} from '@votingworks/test-utils';

const ui = jest.requireActual('@votingworks/ui');

module.exports = {
  ...ui,
  printElement: fakePrintElement,
  printElementWhenReady: fakePrintElementWhenReady,
};
