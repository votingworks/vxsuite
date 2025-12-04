/* istanbul ignore file - @preserve */
import styled from 'styled-components';

const SparklineContainer = styled.div`
  display: inline-block;
  width: 100%;
  height: 100%;
`;

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;
  maxDataPoints?: number;
  minValue?: number;
  maxValue?: number;
}

/**
 * A simple sparkline component for displaying time-series data.
 * Renders an SVG line chart without axes or labels.
 */
export function Sparkline({
  data,
  width = 100,
  height = 30,
  strokeWidth = 2,
  strokeColor = '#4285f4',
  fillColor = 'rgba(66, 133, 244, 0.1)',
  maxDataPoints = 60,
  minValue,
  maxValue,
}: SparklineProps): JSX.Element {
  // Limit data to maxDataPoints
  const limitedData = data.slice(-maxDataPoints);

  if (limitedData.length === 0) {
    return (
      <SparklineContainer>
        <svg width={width} height={height}>
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#999"
            fontSize="10"
          >
            No data
          </text>
        </svg>
      </SparklineContainer>
    );
  }

  // Calculate min/max values for scaling
  const dataMin = minValue ?? Math.min(...limitedData);
  const dataMax = maxValue ?? Math.max(...limitedData);
  const range = dataMax - dataMin || 1; // Avoid division by zero

  // Calculate points for the line
  const points = limitedData.map((value, index) => {
    const x = (index / Math.max(limitedData.length - 1, 1)) * width;
    const y = height - ((value - dataMin) / range) * height;
    return { x, y };
  });

  // Create SVG path
  const linePath = points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${point.x} ${point.y}`;
    })
    .join(' ');

  // Create filled area path
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <SparklineContainer>
      <svg width={width} height={height}>
        {/* Filled area under the line */}
        <path d={areaPath} fill={fillColor} />
        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </SparklineContainer>
  );
}
