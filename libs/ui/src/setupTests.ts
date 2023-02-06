import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';
import { configure } from '@testing-library/react';
import { suppressReact17UnmountedWarning } from '@votingworks/test-utils';

configure({ asyncUtilTimeout: 5_000 });
suppressReact17UnmountedWarning();
