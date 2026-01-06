import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import { getUser } from './api';
import { ElectionsScreen } from './elections_screen';
import { SupportHomeScreen } from './support/support_home_screen';

export function HomeScreen({
  electionsFilterText,
  setElectionsFilterText,
}: {
  electionsFilterText: string;
  setElectionsFilterText: (text: string) => void;
}): React.ReactNode {
  const user = assertDefined(getUser.useQuery().data);
  switch (user.type) {
    case 'jurisdiction_user':
    case 'organization_user':
      return (
        <ElectionsScreen
          filterText={electionsFilterText}
          setFilterText={setElectionsFilterText}
        />
      );

    case 'support_user':
      return <SupportHomeScreen />;

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(user);
    }
  }
}
