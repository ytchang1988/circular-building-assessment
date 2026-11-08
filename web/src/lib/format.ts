export const fmtNum = (n: number, decimals = 3): string => {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const fmtInt = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
};

export const fmtPct = (n: number, decimals = 2): string => {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};
