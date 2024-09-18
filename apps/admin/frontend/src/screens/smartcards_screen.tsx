import styled from 'styled-components';
import { assert } from '@votingworks/basics';
import { LinkButton, P } from '@votingworks/ui';
import { useParams } from 'react-router-dom';

import { NavigationScreen } from '../components/navigation_screen';
import { routerPaths } from '../router_paths';
import { SmartcardsScreenProps, SmartcardType } from '../config/types';
import { SmartcardModal } from '../components/smartcard_modal';

const Body = styled.div`
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
    <NavigationScreen
      title={
        smartcardType === 'election'
          ? 'Election Cards'
          : 'System Administrator Cards'
      }
    >
      <div style={{ display: 'flex' }}>
        <Body>
          <P>Insert a smartcard to:</P>
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
            to={routerPaths.smartcardsByType({
              smartcardType: getOtherSmartcardType(smartcardType),
            })}
          >
            {getOtherSmartcardType(smartcardType) === 'election'
              ? 'Create Election Cards'
              : 'Create System Administrator Cards'}
          </LinkButton>
        </div>
      </div>
      <SmartcardModal />
    </NavigationScreen>
  );
}
