const QUANTITY_PRECISION = 3;
const QUANTITY_FACTOR = 10 ** QUANTITY_PRECISION;

export function formatQuantity(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toFixed(QUANTITY_PRECISION).replace(/\.?0+$/, '');
}

export function formatQuantityWithUnit(
  value: number | string | null | undefined,
  unitOfMeasure?: string | null,
): string {
  const formatted = formatQuantity(value);
  if (!unitOfMeasure) return formatted;
  return `${formatted} ${unitOfMeasure}`;
}

export function parseQuantityInput(
  value: string,
  fallback = 0,
): number {
  if (!value.trim()) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return quantizeQuantity(numeric);
}

export function quantizeQuantity(value: number): number {
  return Math.round(value * QUANTITY_FACTOR) / QUANTITY_FACTOR;
}

export function sumQuantities(values: Array<number | string | null | undefined>): number {
  const total = values.reduce<number>((sum, value) => {
      const numeric = typeof value === 'number' ? value : Number(value ?? 0);
      return Number.isFinite(numeric) ? sum + numeric : sum;
    }, 0);
  return quantizeQuantity(total);
}

export function areQuantitiesEqual(left: number, right: number): boolean {
  return quantizeQuantity(left) === quantizeQuantity(right);
}
