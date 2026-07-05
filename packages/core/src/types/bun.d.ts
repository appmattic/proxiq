declare module "bun:sqlite" {
  export interface StatementLike {
    run(...params: unknown[]): { changes: number };
    get<T = unknown>(...params: unknown[]): T | null;
    all<T = unknown>(...params: unknown[]): T[];
  }

  export interface QueryLike<T = unknown> {
    get(...params: unknown[]): T | null;
    all(...params: unknown[]): T[];
  }

  export class Database {
    constructor(filename: string);
    close(): void;
    exec(sql: string): void;
    run(sql: string, ...params: unknown[]): { changes: number };
    prepare(sql: string): StatementLike;
    query<T = unknown>(sql: string): QueryLike<T>;
  }
}

declare module "bun:test" {
  export const describe: (...args: unknown[]) => void;
  export const it: (...args: unknown[]) => void;
  export const expect: (...args: unknown[]) => any;
  export const beforeEach: (...args: unknown[]) => void;
  export const afterEach: (...args: unknown[]) => void;
}
