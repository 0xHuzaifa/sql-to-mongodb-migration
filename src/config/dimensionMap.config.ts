/**
 * Dynamic Grid Dimension Tag Normalizer
 * Resolves 42 distinct combinations of GRID_DIM_1_TAG, GRID_DIM_2_TAG, GRID_DIM_3_TAG
 * Retains uniform attributes (Hand, Finish, Neck, Sleeve, Lining, etc.)
 * Aliases typo variations (Sisez, SOZE, HIEGHT, etc.)
 */

export type TargetDimensionBucket =
  | { target: 'size' }
  | { target: 'color' }
  | { target: 'length' }
  | {
      target: 'additionalAttributes';
      attributeKey: string;
      originalTag: string;
      flagWarning?: boolean;
    };

const SIZE_ALIASES = new Set(['SIZE', 'SIZES', 'SISEZ', 'SOZE']);
const COLOR_ALIASES = new Set(['COLOR', 'COLORS']);
const LENGTH_ALIASES = new Set(['LENGTH', 'HEIGHT', 'HIEGHT', 'INSEAM']);

// Tags where someone accidentally typed a color/item value into the Tag header in CounterPoint
const ANOMALOUS_VALUE_TAGS = new Set([
  'BLACK',
  'BROWN',
  'TAN',
  'BEANIE',
  'CAP',
  'PATCH',
  'SELECT ONE',
  'G',
  'GC NUMBER',
  'QUANTITY',
]);

export function resolveDimensionTag(
  rawTag: string | null | undefined,
  slotIndex: 1 | 2 | 3
): TargetDimensionBucket {
  if (!rawTag || !rawTag.trim()) {
    return {
      target: 'additionalAttributes',
      attributeKey: `dim_${slotIndex}`,
      originalTag: '',
    };
  }

  const clean = rawTag.trim();
  const upper = clean.toUpperCase();

  if (SIZE_ALIASES.has(upper)) return { target: 'size' };
  if (COLOR_ALIASES.has(upper)) return { target: 'color' };
  if (LENGTH_ALIASES.has(upper)) return { target: 'length' };

  if (ANOMALOUS_VALUE_TAGS.has(upper)) {
    return {
      target: 'additionalAttributes',
      attributeKey: clean.toLowerCase().replace(/\s+/g, '_'),
      originalTag: clean,
      flagWarning: true, // Logs a warning in CounterPointMigration for human review
    };
  }

  // Preserves Hand, Finish, Neck, Sleeve, Width, Cup, Side, Style, Lining, Rank, Pin Type, etc.
  return {
    target: 'additionalAttributes',
    attributeKey: clean.toLowerCase().replace(/\s+/g, '_'),
    originalTag: clean,
  };
}
