import lodashModule from "lodash";

type PropertyKeyPath = readonly (number | string | symbol)[] | string;
type SortOrder = "asc" | "desc";

const lodash = lodashModule as {
  clamp(value: number, lower: number, upper: number): number;
  get(object: unknown, path: PropertyKeyPath): unknown;
  groupBy<T>(
    collection: readonly T[],
    iteratee: (value: T) => number | string | symbol
  ): Record<string, T[]>;
  orderBy<T>(
    collection: readonly T[],
    iteratees: Array<(value: T) => unknown>,
    orders: SortOrder[]
  ): T[];
  sumBy<T>(collection: readonly T[], iteratee: (value: T) => number): number;
  uniq<T>(array: readonly T[]): T[];
  uniqBy<T>(array: readonly T[], iteratee: (value: T) => unknown): T[];
};

export function clamp(value: number, lower: number, upper: number): number {
  return lodash.clamp(value, lower, upper);
}

export function get<TResult>(
  object: unknown,
  path: PropertyKeyPath
): TResult | undefined {
  return lodash.get(object, path) as TResult | undefined;
}

export function groupBy<T>(
  collection: readonly T[],
  iteratee: (value: T) => number | string | symbol
): Record<string, T[]> {
  return lodash.groupBy(collection, iteratee);
}

export function orderBy<T>(
  collection: readonly T[],
  iteratees: Array<(value: T) => unknown>,
  orders: SortOrder[]
): T[] {
  return lodash.orderBy(collection, iteratees, orders);
}

export function sumBy<T>(
  collection: readonly T[],
  iteratee: (value: T) => number
): number {
  return lodash.sumBy(collection, iteratee);
}

export function uniq<T>(array: readonly T[]): T[] {
  return lodash.uniq(array);
}

export function uniqBy<T>(
  array: readonly T[],
  iteratee: (value: T) => unknown
): T[] {
  return lodash.uniqBy(array, iteratee);
}
