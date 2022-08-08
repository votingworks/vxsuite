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

function getOtherSmartcardType(smartcardType: SmartcardType): SmartcardType {
  return smartcardType === 'election' ? 'system-administrator' : 'election';
}

export function SmartcardsScreen(): JSX.Element {
  const { smartcardType } = useParams<SmartcardsScreenProps>();
  assert(
    smartcardType === 'election' || smartcardType === 'system-administrator'
  );

  return (
    <NavigationScreen flexRow>
      <Body maxWidth={false}>
        <h1>
          {smartcardType === 'election'
            ? 'Election Cards'
            : 'System Administrator Cards'}
        </h1>
        <p>Insert a smartcard to:</p>
        <ul>
          <li>View card details.</li>
          <li>
            {smartcardType === 'election'
              ? 'Create an Election Manager or Poll Worker card for this election.'
              : 'Create a System Administrator card.'}
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
          {getOtherSmartcardType(smartcardType) === 'election'
            ? 'Create Election Cards'
            : 'Create System Administrator Cards'}
        </LinkButton>
      </div>
    </NavigationScreen>
  );
}
