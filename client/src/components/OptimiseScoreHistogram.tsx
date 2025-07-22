import React, { useMemo } from "react";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";

// Mock data for demonstration
const mockOptimisationScores = [
  10, 12, 12, 13, 14, 14, 14, 15, 16, 16, 17, 18, 18, 18, 18, 19, 20, 20, 20,
  21,
];

const defaultWidth = 400;
const defaultHeight = 200;
const verticalMargin = 40;

const getBins = (scores: number[]) => {
  // Count occurrences of each score (or bin)
  const binMap: Record<number, number> = {};
  scores.forEach((score) => {
    binMap[score] = (binMap[score] || 0) + 1;
  });
  // Convert to array of { score, count }
  return Object.entries(binMap)
    .map(([score, count]) => ({ score: Number(score), count }))
    .sort((a, b) => a.score - b.score);
};

const OptimiseScoreHistogram: React.FC<{
  optimisationScores?: number[];
  width?: number;
  height?: number;
}> = ({
  optimisationScores = mockOptimisationScores,
  width = defaultWidth,
  height = defaultHeight,
}) => {
  const bins = useMemo(() => getBins(optimisationScores), [optimisationScores]);
  const xMax = width;
  const yMax = height - verticalMargin;

  // Scales
  const xScale = useMemo(
    () =>
      scaleBand<number>({
        range: [0, xMax],
        domain: bins.map((d) => d.score),
        padding: 0.2,
      }),
    [xMax, bins]
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        range: [yMax, 0],
        domain: [0, Math.max(...bins.map((d) => d.count), 1)],
      }),
    [yMax, bins]
  );

  return width < 10 ? null : (
    <svg width={width} height={height}>
      <Group top={verticalMargin / 2} left={32}>
        {bins.map((bin) => {
          const barWidth = xScale.bandwidth();
          const barHeight = yMax - (yScale(bin.count) ?? 0);
          const barX = xScale(bin.score);
          const barY = yMax - barHeight;
          return (
            <Bar
              key={`bar-${bin.score}`}
              x={barX}
              y={barY}
              width={barWidth}
              height={barHeight}
              fill="#3b82f6"
            />
          );
        })}
        {/* X-axis labels */}
        {bins.map((bin) => {
          const barX = xScale(bin.score);
          return (
            <text
              key={`label-${bin.score}`}
              x={(barX ?? 0) + xScale.bandwidth() / 2}
              y={yMax + 16}
              textAnchor="middle"
              fontSize={12}
              fill="#333"
            >
              {bin.score}
            </text>
          );
        })}
        {/* Y-axis label (max) */}
        <text
          x={-24}
          y={yScale(Math.max(...bins.map((d) => d.count), 1))}
          fontSize={12}
          fill="#333"
          textAnchor="end"
        >
          {Math.max(...bins.map((d) => d.count), 1)}
        </text>
      </Group>
    </svg>
  );
};

export default OptimiseScoreHistogram;
