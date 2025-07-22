import React, { useMemo } from "react";
import { Bar } from "@visx/shape";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { GridRows, GridColumns } from "@visx/grid";

// default config
const defaultWidth = 1000;
const defaultHeight = 333;
const verticalMargin = 40;

interface BarsProps {
  optimisationScores: number[];
  width?: number;
  height?: number;
}

const OptimiseScoreHistogram: React.FC<BarsProps> = ({
  optimisationScores,
  width = defaultWidth,
  height = defaultHeight,
}) => {
  const getBins = (scores: number[], binSize = 2) => {
    if (scores.length === 0) return [];

    // determine bin range
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    // calc num bins
    const binCount = Math.ceil((max - min) / binSize) + 1;

    // initialise bins (array of objects with score and count fields)
    const bins: { score: number; count: number }[] = Array.from(
      { length: binCount }, // define length of array
      (_, i) => ({
        score: min + i * binSize,
        count: 0,
      })
    );

    // assign each score to bin
    scores.forEach((score) => {
      const binIndex = Math.floor((score - min) / binSize);
      bins[binIndex].count += 1;
    });

    // filter out empty bins and sort by score
    return bins
      .filter((bin) => bin.count > 0)
      .sort((a, b) => a.score - b.score);
  };

  // parse scores into bins
  const bins = useMemo(() => getBins(optimisationScores), [optimisationScores]);

  // define bounds
  const xMax = width;
  const yMax = height - verticalMargin;

  // define scales, memoize for performance
  const xScale = useMemo(
    () =>
      scaleBand<number>({
        range: [0, xMax],
        round: true,
        domain: bins.map((bin) => bin.score),
        padding: 0.4,
      }),
    [xMax, bins]
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        range: [yMax, 0],
        domain: [0, Math.max(...bins.map((bin) => bin.count))],
      }),
    [yMax, bins]
  );

  return width < 10 ? null : (
    <div className="flex justify-center">
      <svg width={width} height={height}>
        <GridRows
          left={0}
          scale={yScale}
          width={width}
          strokeDasharray="1,3"
          stroke="#333"
          strokeOpacity={0}
          pointerEvents="none"
        />
        <GridColumns
          top={0}
          scale={xScale}
          height={height}
          strokeDasharray="1,3"
          stroke="#333"
          strokeOpacity={0.2}
          pointerEvents="none"
        />
        <Group top={verticalMargin / 2}>
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

          {/* x-axis labels */}
          {bins.map((bin) => {
            const barX = xScale(bin.score);
            return (
              <text
                key={`label-${bin.score}`}
                x={(barX ?? 0) + xScale.bandwidth() / 2}
                y={yMax + 20}
                textAnchor="middle"
                fontSize={12}
                fill="#333"
              >
                {bin.score}
              </text>
            );
          })}

          {/* y-axis labels */}
          {(() => {
            const maxCount = Math.max(...bins.map((d) => d.count), 1);
            // Choose a reasonable number of ticks (e.g., 4)
            const numTicks = 10;
            // Calculate interval, round to nearest integer >= 1
            const interval = Math.max(1, Math.ceil(maxCount / numTicks));
            // Generate tick values
            const ticks = [];
            for (let i = 0; i <= maxCount; i += interval) {
              ticks.push(i);
            }
            // Ensure maxCount is included as last tick if not already
            if (ticks[ticks.length - 1] !== maxCount) {
              ticks.push(maxCount);
            }
            return ticks.map((tick) => (
              <text
                key={`y-label-${tick}`}
                x={12}
                y={yScale(tick)}
                fontSize={12}
                fill="#333"
                textAnchor="end"
                alignmentBaseline="middle"
              >
                {tick}
              </text>
            ));
          })()}
        </Group>
      </svg>
    </div>
  );
};

export default OptimiseScoreHistogram;
