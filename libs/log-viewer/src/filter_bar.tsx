import React, { useMemo } from 'react';
import styled from 'styled-components';
import type { FilterState, StitchedLogFile } from './types';
import { isVxLogLine } from './types';

const FilterContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #ddd;
  background: #fafafa;
  align-items: center;
`;

const FilterGroup = styled.label`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;

  select,
  input {
    font-size: 0.8125rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
`;

const MatchCount = styled.span`
  font-size: 0.8125rem;
  color: #666;
  margin-left: auto;
`;

interface FilterBarProps {
  readonly stitchedLog: StitchedLogFile;
  readonly filterState: FilterState;
  readonly onFilterChange: (state: FilterState) => void;
}

export function FilterBar({
  stitchedLog,
  filterState,
  onFilterChange,
}: FilterBarProps): JSX.Element {
  const options = useMemo(() => {
    const eventIds = new Set<string>();
    const sources = new Set<string>();
    const eventTypes = new Set<string>();
    const dispositions = new Set<string>();

    for (const line of stitchedLog.lines) {
      if (isVxLogLine(line)) {
        if (line.eventId) eventIds.add(line.eventId);
        if (line.source) sources.add(line.source);
        if (line.eventType) eventTypes.add(line.eventType);
        if (line.disposition) dispositions.add(line.disposition);
      }
    }

    return {
      eventIds: [...eventIds].sort(),
      sources: [...sources].sort(),
      eventTypes: [...eventTypes].sort(),
      dispositions: [...dispositions].sort(),
    };
  }, [stitchedLog]);

  const hasVxLogs = stitchedLog.lines.some(isVxLogLine);

  const filteredCount = useMemo(
    () =>
      stitchedLog.lines.filter((line) => {
        if (!isVxLogLine(line)) return true;
        if (filterState.eventId && line.eventId !== filterState.eventId) return false;
        if (filterState.source && line.source !== filterState.source) return false;
        if (filterState.eventType && line.eventType !== filterState.eventType) return false;
        if (
          filterState.disposition &&
          line.disposition !== filterState.disposition
        ) return false;
        if (
          filterState.searchText &&
          !line.message
            .toLowerCase()
            .includes(filterState.searchText.toLowerCase()) &&
          !line.raw.toLowerCase().includes(filterState.searchText.toLowerCase())
        ) return false;
        if (
          filterState.timeStart &&
          line.timeLogWritten < filterState.timeStart
        ) return false;
        if (filterState.timeEnd && line.timeLogWritten > filterState.timeEnd) return false;
        return true;
      }).length,
    [stitchedLog, filterState]
  );

  function updateFilter(key: keyof FilterState, value: string) {
    onFilterChange({ ...filterState, [key]: value });
  }

  return (
    <FilterContainer>
      <FilterGroup>
        Search:
        <input
          type="text"
          placeholder="Filter text..."
          value={filterState.searchText}
          onChange={(e) => updateFilter('searchText', e.target.value)}
        />
      </FilterGroup>
      {hasVxLogs && (
        <React.Fragment>
          <FilterGroup>
            Source:
            <select
              value={filterState.source}
              onChange={(e) => updateFilter('source', e.target.value)}
            >
              <option value="">All</option>
              {options.sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup>
            Event:
            <select
              value={filterState.eventId}
              onChange={(e) => updateFilter('eventId', e.target.value)}
            >
              <option value="">All</option>
              {options.eventIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup>
            Type:
            <select
              value={filterState.eventType}
              onChange={(e) => updateFilter('eventType', e.target.value)}
            >
              <option value="">All</option>
              {options.eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup>
            Disposition:
            <select
              value={filterState.disposition}
              onChange={(e) => updateFilter('disposition', e.target.value)}
            >
              <option value="">All</option>
              {options.dispositions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FilterGroup>
          <FilterGroup>
            From:
            <input
              type="datetime-local"
              value={filterState.timeStart}
              onChange={(e) => updateFilter('timeStart', e.target.value)}
            />
          </FilterGroup>
          <FilterGroup>
            To:
            <input
              type="datetime-local"
              value={filterState.timeEnd}
              onChange={(e) => updateFilter('timeEnd', e.target.value)}
            />
          </FilterGroup>
        </React.Fragment>
      )}
      <MatchCount>
        {filteredCount} / {stitchedLog.lines.length} lines
      </MatchCount>
    </FilterContainer>
  );
}
