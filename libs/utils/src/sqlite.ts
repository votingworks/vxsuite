export type SqliteBool = 0 | 1;

export function asSqliteBool(bool: boolean): SqliteBool {
  return bool ? 1 : 0;
}

export function fromSqliteBool(sqliteBool: SqliteBool): boolean {
  return sqliteBool === 1;
}
