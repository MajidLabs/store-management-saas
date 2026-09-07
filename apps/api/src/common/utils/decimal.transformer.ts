import { ValueTransformer } from 'typeorm';

/**
 * TypeORM returns `decimal` columns as strings by default, to avoid silent
 * float-precision loss at the driver level. That's the safer default for
 * storage, but awkward for API consumers. This transformer keeps Postgres
 * storing an exact decimal while the application (and API responses) sees
 * a plain number.
 */
export const DecimalTransformer: ValueTransformer = {
  to: (value?: number) => value,
  from: (value?: string) =>
    value === null || value === undefined ? value : parseFloat(value),
};
