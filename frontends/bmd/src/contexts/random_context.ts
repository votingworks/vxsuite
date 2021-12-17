import { randomGenerator } from '@votingworks/utils';
import { createContext } from 'react';

import { RandomContextInterface } from '../config/types';

const random: RandomContextInterface = {
  generator: randomGenerator(),
};

export const RandomContext = createContext(random);
