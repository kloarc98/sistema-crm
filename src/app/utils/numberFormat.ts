const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string | null | undefined, symbol = "Q") {
  const numeric = Number(value ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `${symbol}${decimalFormatter.format(safe)}`;
}

export function formatNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return integerFormatter.format(safe);
}

export function formatDecimal(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return decimalFormatter.format(safe);
}
