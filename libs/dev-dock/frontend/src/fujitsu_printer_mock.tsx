import type { PrinterStatus } from '@votingworks/fujitsu-thermal-printer';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { useApiClient } from './api_client';

const MOCK_PRINTER_STATUS_OPTIONS: Record<string, PrinterStatus> = {
  idle: {
    state: 'idle',
  },
  'no-paper': {
    state: 'no-paper',
  },
  'cover-open': {
    state: 'cover-open',
  },
  disconnected: {
    state: 'error',
    type: 'disconnected',
  },
  'error-hardware': {
    state: 'error',
    type: 'hardware',
  },
  'error-temp': {
    state: 'error',
    type: 'temperature',
  },
  'error-power': {
    state: 'error',
    type: 'supply-voltage',
  },
  'error-data': {
    state: 'error',
    type: 'receive-data',
  },
};

type PrinterStatusOptionKey = keyof typeof MOCK_PRINTER_STATUS_OPTIONS;

function getPrinterStatusOptionKey(
  status: PrinterStatus
): PrinterStatusOptionKey {
  switch (status.state) {
    case 'idle':
      return 'idle';
    case 'no-paper':
      return 'no-paper';
    case 'cover-open':
      return 'cover-open';
    case 'error':
      switch (status.type) {
        case 'disconnected':
          return 'disconnected';
        case 'hardware':
          return 'error-hardware';
        case 'temperature':
          return 'error-temp';
        case 'supply-voltage':
          return 'error-power';
        case 'receive-data':
          return 'error-data';
        default:
          throwIllegalValue(status.type);
      }
      break;
    default:
      throwIllegalValue(status, 'state');
  }
}

const FujitsuPrinterSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.2rem;
`;

const StyledSelect = styled.select`
  padding: 4px;
  border-radius: 4px;
  background-color: white;
`;

const SELECT_ID = 'fujitsu-printer-status-select';

function PrinterStatusSelect(): JSX.Element {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getFujitsuPrinterStatusQuery = useQuery(
    ['getFujitsuPrinterStatus'],
    () => apiClient.getFujitsuPrinterStatus()
  );
  const setFujitsuPrinterStatusMutation = useMutation(
    apiClient.setFujitsuPrinterStatus,
    {
      onSuccess: async () =>
        await queryClient.invalidateQueries(['getFujitsuPrinterStatus']),
    }
  );

  const status = getFujitsuPrinterStatusQuery.data ?? undefined;

  const isFeatureEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  function onChangeStatus(
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const newStatus = MOCK_PRINTER_STATUS_OPTIONS[event.target.value];
    assert(newStatus);
    setFujitsuPrinterStatusMutation.mutate(newStatus);
  }

  const disabled = !isFeatureEnabled || !getFujitsuPrinterStatusQuery.isSuccess;

  if (disabled) {
    return (
      <StyledSelect disabled id={SELECT_ID}>
        <option key="disabled">Disabled</option>
      </StyledSelect>
    );
  }

  return (
    <StyledSelect
      onChange={onChangeStatus}
      value={getPrinterStatusOptionKey(assertDefined(status))}
      id={SELECT_ID}
    >
      {Object.entries(MOCK_PRINTER_STATUS_OPTIONS).map(([key]) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </StyledSelect>
  );
}

export function FujitsuPrinterMockControl(): JSX.Element {
  return (
    <FujitsuPrinterSection>
      <label htmlFor="fujitsu-printer-status-select">
        <strong>Printer:</strong>
      </label>
      <PrinterStatusSelect />
    </FujitsuPrinterSection>
  );
}
