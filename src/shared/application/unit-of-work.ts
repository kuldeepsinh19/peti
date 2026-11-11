/**
 * Runs work atomically. `R` is the set of transaction-scoped repositories a module needs; the
 * infrastructure implementation opens a database transaction and builds them for it.
 */
export interface UnitOfWork<R> {
  run<T>(work: (repos: R) => Promise<T>): Promise<T>;
}
