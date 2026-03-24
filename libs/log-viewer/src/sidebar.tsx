import React, { useState } from 'react';
import styled from 'styled-components';
import type { LogSelection, LogZipContents } from './types';

const SidebarContainer = styled.nav`
  width: 280px;
  background: #f5f5f5;
  border-right: 1px solid #ddd;
  overflow-y: auto;
  padding: 0.5rem 0;
`;

const SectionHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  text-align: left;
  color: inherit;

  &:hover {
    background: #eee;
  }
`;

const SessionHeader = styled(SectionHeader)`
  padding-left: 1.5rem;
  font-weight: 500;
  font-size: 0.8125rem;
  color: #666;
`;

const LogTypeButton = styled.button<{ isSelected: boolean }>`
  display: block;
  width: 100%;
  padding: 0.375rem 2rem;
  background: ${(p) => (p.isSelected ? '#0066cc' : 'none')};
  color: ${(p) => (p.isSelected ? 'white' : 'inherit')};
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  text-align: left;
  font-family: monospace;

  &:hover {
    background: ${(p) => (p.isSelected ? '#0066cc' : '#eee')};
  }
`;

const Arrow = styled.span<{ expanded: boolean }>`
  display: inline-block;
  transition: transform 0.15s;
  transform: rotate(${(p) => (p.expanded ? '90deg' : '0deg')});
`;

interface SidebarProps {
  readonly contents: LogZipContents;
  readonly selection: LogSelection | null;
  readonly onSelect: (selection: LogSelection) => void;
}

export function Sidebar({
  contents,
  selection,
  onSelect,
}: SidebarProps): JSX.Element {
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(
    () => new Set(contents.machines.map((m) => m.id))
  );
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    () =>
      new Set(
        contents.machines.flatMap((m) =>
          m.sessions.map((s) => `${m.id}/${s.timestamp}`)
        )
      )
  );

  function toggleMachine(machineId: string) {
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(machineId)) {
        next.delete(machineId);
      } else {
        next.add(machineId);
      }
      return next;
    });
  }

  function toggleSession(key: string) {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <SidebarContainer>
      {contents.machines.map((machine) => (
        <div key={machine.id}>
          <SectionHeader onClick={() => toggleMachine(machine.id)}>
            <Arrow expanded={expandedMachines.has(machine.id)}>&#9654;</Arrow>
            {machine.id}
          </SectionHeader>
          {expandedMachines.has(machine.id) &&
            machine.sessions.map((session) => {
              const sessionKey = `${machine.id}/${session.timestamp}`;
              return (
                <div key={session.timestamp}>
                  {machine.sessions.length > 1 && (
                    <SessionHeader onClick={() => toggleSession(sessionKey)}>
                      <Arrow expanded={expandedSessions.has(sessionKey)}>
                        &#9654;
                      </Arrow>
                      {session.timestamp}
                    </SessionHeader>
                  )}
                  {(machine.sessions.length === 1 ||
                    expandedSessions.has(sessionKey)) &&
                    session.logTypes.map((logType) => (
                      <LogTypeButton
                        key={logType}
                        isSelected={
                          selection?.machineId === machine.id &&
                          selection?.sessionTimestamp === session.timestamp &&
                          selection?.logType === logType
                        }
                        onClick={() =>
                          onSelect({
                            machineId: machine.id,
                            sessionTimestamp: session.timestamp,
                            logType,
                          })
                        }
                      >
                        {logType}
                      </LogTypeButton>
                    ))}
                </div>
              );
            })}
        </div>
      ))}
    </SidebarContainer>
  );
}
