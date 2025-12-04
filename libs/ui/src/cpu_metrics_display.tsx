/* istanbul ignore file - @preserve */
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import type { CpuMetrics } from '@votingworks/backend';
import { Sparkline } from './sparkline';

// Landscape mode - horizontal top bar (single row)
const TopBar = styled.div<{ portrait?: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 85%);
  color: #fff;
  display: flex;
  flex-wrap: ${({ portrait }) => (portrait ? 'wrap' : 'nowrap')};
  align-items: center;
  padding: ${({ portrait }) => (portrait ? '0.5rem 0.75rem' : '0 1rem')};
  gap: ${({ portrait }) => (portrait ? '0.5rem 1.5rem' : '2rem')};
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 30%);
  ${({ portrait }) => !portrait && 'height: 60px;'}
`;

const MetricGroup = styled.div<{ portrait?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  ${({ portrait }) =>
    portrait &&
    `
    flex: 0 0 auto;
  `}
`;

const MetricContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MetricLabel = styled.div<{ portrait?: boolean }>`
  font-size: ${({ portrait }) => (portrait ? '0.5rem' : '0.7rem')};
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.7;
  letter-spacing: 0.05em;
`;

const MetricValue = styled.div<{ portrait?: boolean }>`
  font-size: ${({ portrait }) => (portrait ? '0.75rem' : '0.95rem')};
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  min-width: ${({ portrait }) => (portrait ? 'auto' : '60px')};
`;

const SparklineWrapper = styled.div<{ portrait?: boolean }>`
  width: ${({ portrait }) => (portrait ? '60px' : '80px')};
  height: ${({ portrait }) => (portrait ? '24px' : '30px')};
`;

interface MetricHistory {
  temperatures: number[];
  loadAverages1m: number[];
  memoryUsedPercent: number[];
}

const MAX_HISTORY_POINTS = 60; // Keep 60 data points (1 minute at 1s intervals)

export interface CpuMetricsDisplayProps {
  /**
   * The current CPU metrics data. If undefined, a loading state is shown.
   */
  metrics?: CpuMetrics;
  /**
   * Display orientation. Use 'portrait' for VxMark/VxMarkScan (vertical sidebar),
   * 'landscape' for VxScan (horizontal top bar). Defaults to 'landscape'.
   */
  orientation?: 'portrait' | 'landscape';
}

/**
 * Display CPU metrics with sparklines showing historical trends.
 * This component should receive metrics data from a parent component
 * that handles the API call.
 */
export function CpuMetricsDisplay({
  metrics,
  orientation = 'landscape',
}: CpuMetricsDisplayProps): JSX.Element {
  const isPortrait = orientation === 'portrait';
  const [history, setHistory] = useState<MetricHistory>({
    temperatures: [],
    loadAverages1m: [],
    memoryUsedPercent: [],
  });

  // Update history when new data arrives
  useEffect(() => {
    if (metrics) {
      const memUsedPercent =
        (metrics.memory.usedBytes / metrics.memory.totalBytes) * 100;

      setHistory((prev) => ({
        temperatures:
          metrics.temperatureCelsius !== null
            ? [...prev.temperatures, metrics.temperatureCelsius].slice(
                -MAX_HISTORY_POINTS
              )
            : prev.temperatures,
        loadAverages1m: [
          ...prev.loadAverages1m,
          metrics.loadAverage.oneMinute,
        ].slice(-MAX_HISTORY_POINTS),
        memoryUsedPercent: [...prev.memoryUsedPercent, memUsedPercent].slice(
          -MAX_HISTORY_POINTS
        ),
      }));
    }
  }, [metrics]);

  if (!metrics) {
    return (
      <TopBar portrait={isPortrait}>
        <MetricLabel portrait={isPortrait}>
          Loading system metrics&hellip;
        </MetricLabel>
      </TopBar>
    );
  }

  const memUsed = format.bytes(metrics.memory.usedBytes);
  const memTotal = format.bytes(metrics.memory.totalBytes);
  const memAvail = format.bytes(metrics.memory.availableBytes);
  const memCached = format.bytes(metrics.memory.cachedBytes);
  const memFree = format.bytes(metrics.memory.freeBytes);

  return (
    <TopBar portrait={isPortrait}>
      {/* CPU Temperature */}
      {metrics.temperatureCelsius !== null && (
        <MetricGroup portrait={isPortrait}>
          <MetricContent>
            <MetricLabel portrait={isPortrait}>CPU</MetricLabel>
            <MetricValue portrait={isPortrait}>
              {metrics.temperatureCelsius.toFixed(1)}°C
            </MetricValue>
          </MetricContent>
          <SparklineWrapper portrait={isPortrait}>
            {history.temperatures.length > 0 && (
              <Sparkline
                data={history.temperatures}
                strokeColor="#ff6b6b"
                fillColor="rgba(255, 107, 107, 0.2)"
                minValue={20}
                maxValue={100}
                strokeWidth={1.5}
              />
            )}
          </SparklineWrapper>
        </MetricGroup>
      )}

      {/* Load Average */}
      <MetricGroup portrait={isPortrait}>
        <MetricContent>
          <MetricLabel portrait={isPortrait}>Load</MetricLabel>
          <MetricValue portrait={isPortrait}>
            {metrics.loadAverage.oneMinute.toFixed(2)}
          </MetricValue>
        </MetricContent>
        <SparklineWrapper portrait={isPortrait}>
          {history.loadAverages1m.length > 0 && (
            <Sparkline
              data={history.loadAverages1m}
              strokeColor="#4285f4"
              fillColor="rgba(66, 133, 244, 0.2)"
              minValue={0}
              strokeWidth={1.5}
            />
          )}
        </SparklineWrapper>
      </MetricGroup>

      {/* Memory */}
      <MetricGroup portrait={isPortrait}>
        <MetricContent>
          <MetricLabel portrait={isPortrait}>Memory</MetricLabel>
          <MetricValue portrait={isPortrait}>
            {isPortrait ? memUsed : `${memUsed} of ${memTotal}`}
          </MetricValue>
        </MetricContent>
        <SparklineWrapper portrait={isPortrait}>
          {history.memoryUsedPercent.length > 0 && (
            <Sparkline
              data={history.memoryUsedPercent}
              strokeColor="#34a853"
              fillColor="rgba(52, 168, 83, 0.2)"
              minValue={0}
              maxValue={100}
              strokeWidth={1.5}
            />
          )}
        </SparklineWrapper>
      </MetricGroup>

      {/* Memory Details */}
      <MetricGroup portrait={isPortrait}>
        <MetricContent>
          <MetricLabel portrait={isPortrait}>Available</MetricLabel>
          <MetricValue portrait={isPortrait}>{memAvail}</MetricValue>
        </MetricContent>
      </MetricGroup>

      <MetricGroup portrait={isPortrait}>
        <MetricContent>
          <MetricLabel portrait={isPortrait}>Cached</MetricLabel>
          <MetricValue portrait={isPortrait}>{memCached}</MetricValue>
        </MetricContent>
      </MetricGroup>

      <MetricGroup portrait={isPortrait}>
        <MetricContent>
          <MetricLabel portrait={isPortrait}>Free</MetricLabel>
          <MetricValue portrait={isPortrait}>{memFree}</MetricValue>
        </MetricContent>
      </MetricGroup>
    </TopBar>
  );
}
