import { SearchSelect, SelectOption } from '@votingworks/ui';
import React from 'react';
import * as api from './api';

export interface JurisdictionSelectProps {
  disabled?: boolean;
  onChange: (selectedJurisdictionId?: string) => void;
  selectedJurisdictionId?: string;
  style?: React.CSSProperties;
}
export function JurisdictionSelect(
  props: JurisdictionSelectProps
): JSX.Element {
  const { disabled, onChange, selectedJurisdictionId, style } = props;

  const jurisdictions = api.listJurisdictions.useQuery().data;

  const options = React.useMemo(
    () =>
      (jurisdictions || []).map<SelectOption>((j) => ({
        label: j.name,
        value: j.id,
      })),
    [jurisdictions]
  );

  return (
    <SearchSelect
      aria-label="Jurisdiction"
      menuPortalTarget={document.body}
      options={options}
      onChange={onChange}
      disabled={disabled}
      isSearchable
      value={selectedJurisdictionId}
      style={style}
    />
  );
}
