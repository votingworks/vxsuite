import { SearchSelect, SelectOption } from '@votingworks/ui';
import React from 'react';
import * as api from './api';

export interface OrgSelectProps {
  disabled?: boolean;
  onChange: (selectedOrgId?: string) => void;
  selectedOrgId?: string;
  style?: React.CSSProperties;
}
export function OrgSelect(props: OrgSelectProps): JSX.Element {
  const { disabled, onChange, selectedOrgId, style } = props;

  const orgs = api.listOrganizations.useQuery().data;

  const options = React.useMemo(
    () =>
      (orgs || []).map<SelectOption>((o) => ({
        label: o.name,
        value: o.id,
      })),
    [orgs]
  );

  return (
    <SearchSelect
      aria-label="Organization"
      menuPortalTarget={document.body}
      options={options}
      onChange={onChange}
      disabled={disabled}
      isSearchable
      value={selectedOrgId}
      style={style}
    />
  );
}
