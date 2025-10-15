import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { format } from '@votingworks/utils';
import { Sparkline } from './sparkline';
import * as api from './api';

const TopBar = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: rgba(0, 0, 0, 85%);
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 2rem;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 30%);
`;

const MetricGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MetricContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MetricLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.7;
  letter-spacing: 0.05em;
`;

const MetricValue = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  min-width: 60px;
`;

const SparklineWrapper = styled.div`
  width: 80px;
  height: 30px;
`;

interface MetricHistory {
  temperatures: number[];
  loadAverages1m: number[];
  memoryUsedPercent: number[];
}

const MAX_HISTORY_POINTS = 60; // Keep 60 data points (1 minute at 1s intervals)

/**
 * Display CPU metrics with sparklines showing historical trends
 */
export function CpuMetricsDisplay(): JSX.Element {
  const getCpuMetricsQuery = api.getCpuMetrics.useQuery();
  const [history, setHistory] = useState<MetricHistory>({
    temperatures: [],
    loadAverages1m: [],
    memoryUsedPercent: [],
  });

  // Update history when new data arrives
  useEffect(() => {
    if (getCpuMetricsQuery.data) {
      const metrics = getCpuMetricsQuery.data;
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
  }, [getCpuMetricsQuery.data]);

  const metrics = getCpuMetricsQuery.data;

  if (!metrics) {
    return (
      <TopBar>
        <MetricLabel>Loading system metrics&hellip;</MetricLabel>
      </TopBar>
    );
  }

  const memUsed = format.bytes(metrics.memory.usedBytes);
  const memTotal = format.bytes(metrics.memory.totalBytes);
  const memAvail = format.bytes(metrics.memory.availableBytes);
  const memCached = format.bytes(metrics.memory.cachedBytes);
  const memFree = format.bytes(metrics.memory.freeBytes);

  return (
    <TopBar>
      {/* CPU Temperature */}
      {metrics.temperatureCelsius !== null && (
        <MetricGroup>
          <MetricContent>
            <MetricLabel>CPU</MetricLabel>
            <MetricValue>{metrics.temperatureCelsius.toFixed(1)}°C</MetricValue>
          </MetricContent>
          <SparklineWrapper>
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
      <MetricGroup>
        <MetricContent>
          <MetricLabel>Load</MetricLabel>
          <MetricValue>{metrics.loadAverage.oneMinute.toFixed(2)}</MetricValue>
        </MetricContent>
        <SparklineWrapper>
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
      <MetricGroup>
        <MetricContent>
          <MetricLabel>Memory Used</MetricLabel>
          <MetricValue>
            {memUsed} of {memTotal}
          </MetricValue>
        </MetricContent>
        <SparklineWrapper>
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
      <MetricGroup>
        <MetricContent>
          <MetricLabel>Available</MetricLabel>
          <MetricValue>{memAvail}</MetricValue>
        </MetricContent>
      </MetricGroup>

      <MetricGroup>
        <MetricContent>
          <MetricLabel>Cached</MetricLabel>
          <MetricValue>{memCached}</MetricValue>
        </MetricContent>
      </MetricGroup>

      <MetricGroup>
        <MetricContent>
          <MetricLabel>Free</MetricLabel>
          <MetricValue>{memFree}</MetricValue>
        </MetricContent>
      </MetricGroup>
    </TopBar>
  );
}
