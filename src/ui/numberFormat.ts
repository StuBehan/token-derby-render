export function formatCompactNumber(value: number) {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);

  if (abs >= 1_000_000_000) return `${(rounded / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}b`;
  if (abs >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (abs >= 1_000) return `${(rounded / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return rounded.toString();
}
