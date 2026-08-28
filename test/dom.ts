import { reportableError } from "./waitFor";

/**
 * Queries `root` for `selector`, throwing instead of returning null.
 *
 * A bare `querySelector(...)!` turns a missing element into a TypeError on
 * whatever the next line does with it, which points the failure at the wrong
 * place. This throws at the query itself and names what the caller expected
 * to find.
 */
export function query<T extends Element = Element>(
  root: ParentNode,
  selector: string,
  why: string,
): T {
  const found = root.querySelector<T>(selector);
  if (!found) {
    throw reportableError(`query: ${why} (no match for "${selector}")`);
  }
  return found;
}

/**
 * Queries `root` for every match of `selector`, typed as `T[]`.
 *
 * `querySelectorAll` types its elements as `unknown` under this project's
 * sandbox tsconfig, and `Array.from` only recovers the element type when
 * it's named explicitly at the call site. Unlike `query`, an empty result is
 * a legitimate outcome here (a "zero matches" assertion), so this does not
 * throw.
 */
export function queryAll<T extends Element = Element>(
  root: ParentNode,
  selector: string,
): T[] {
  return Array.from<T>(root.querySelectorAll<T>(selector));
}
