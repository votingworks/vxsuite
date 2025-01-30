import { SearchSelect, SelectOption } from '@votingworks/ui';
import React from 'react';
import * as api from './api';

export interface OrgSelectProps {
  disabled?: boolean;
  onChange: (selectedOrgId?: string) => void;
  selectedOrgId?: string;
}
export function OrgSelect(props: OrgSelectProps): JSX.Element {
  const { disabled, onChange, selectedOrgId } = props;

  const orgs = api.getAllOrgs.useQuery().data;

  const options = React.useMemo(
    () =>
      (orgs || []).map<SelectOption>((o) => ({
        label: o.displayName,
        value: o.id,
      })),
    [orgs]
  );

  return (
    <SearchSelect
      options={options}
      onChange={onChange}
      disabled={disabled}
      isSearchable
      value={selectedOrgId}
    />
  );
}
