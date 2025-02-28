import React, { useState } from 'react';

interface Props {
  additionalContent?: React.ReactNode;
  isTestRunning: boolean;
  graphic: React.ReactNode;
  statusMessages: Array<{
    component: string;
    statusMessage: string;
    updatedAt: string;
  }>;
  stopTesting: () => void;
}

export function ElectricalTestingScreen({
  additionalContent,
  isTestRunning,
  graphic,
  statusMessages,
  stopTesting,
}: Props): JSX.Element {
  const [testButtonLastPressedAt, setTestButtonLastPressedAt] =
    useState<Date>();

  return (
    <div
      style={{
        alignItems: 'start',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1rem',
      }}
    >
      {graphic}
      <ul style={{ listStyleType: 'none', margin: 0, padding: 0 }}>
        {statusMessages.map(({ component, statusMessage, updatedAt }) => (
          <li key={component}>
            [{updatedAt}] {component}: {statusMessage}
          </li>
        ))}
      </ul>
      <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
        <button
          disabled={!isTestRunning}
          onClick={() => setTestButtonLastPressedAt(new Date())}
          type="button"
        >
          Test Button
        </button>
        {testButtonLastPressedAt && (
          <span>Last pressed at {testButtonLastPressedAt.toISOString()}</span>
        )}
      </div>
      {additionalContent}
      <br />
      <button disabled={!isTestRunning} onClick={stopTesting} type="button">
        {isTestRunning ? 'Stop Testing' : 'Testing Stopped'}
      </button>
    </div>
  );
}
