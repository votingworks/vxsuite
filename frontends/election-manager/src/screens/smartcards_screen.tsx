import React from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/utils';
import { LinkButton, Prose } from '@votingworks/ui';
import { useParams } from 'react-router-dom';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { SmartcardsScreenProps, SmartcardType } from '../config/types';

const Body = styled(Prose)`
  flex-grow: 1;
`;

const smartcardTypeToReadableString: Record<SmartcardType, string> = {
  election: 'Election',
  'super-admin': 'Super Admin',
};

function getOtherSmartcardType(smartcardType: SmartcardType): SmartcardType {
  return smartcardType === 'election' ? 'super-admin' : 'election';
}

export function SmartcardsScreen(): JSX.Element {
  const { smartcardType } = useParams<SmartcardsScreenProps>();
  assert(smartcardType === 'election' || smartcardType === 'super-admin');

  return (
    <NavigationScreen flexRow>
      <Body maxWidth={false}>
        <h1>{smartcardTypeToReadableString[smartcardType]} Cards</h1>
        <p>Insert a smartcard to:</p>
        <ul>
          <li>View card details.</li>
          <li>
            {smartcardType === 'election'
              ? 'Create an Admin or Poll Worker card for this election.'
              : 'Create a Super Admin card.'}
          </li>
        </ul>
      </Body>
      <div>
        <LinkButton
          small
          to={routerPaths.smartcardsByType({
            smartcardType: getOtherSmartcardType(smartcardType),
          })}
        >
          Create{' '}
          {smartcardTypeToReadableString[getOtherSmartcardType(smartcardType)]}{' '}
          Cards
        </LinkButton>
      </div>
    </NavigationScreen>
  );
}
