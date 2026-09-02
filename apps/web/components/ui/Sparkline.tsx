export function Sparkline({
  points,
  color,
  viewBoxWidth = 220,
  height = 52,
}: {
  points: string;
  color: string;
  viewBoxWidth?: number;
  height?: number;
}) {
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${viewBoxWidth} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
