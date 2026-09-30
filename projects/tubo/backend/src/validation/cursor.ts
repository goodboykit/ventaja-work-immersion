import { ValidationError } from "../domain/errors.ts";

// A cursor remembers where the previous page ended: (created_at, id) of its last invoice.
// "Keyset" paging stays fast on huge tables, unlike OFFSET which re-reads every skipped row.
export interface Cursor {
  createdAt: string;
  id: string;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString("base64url");
}

// Strict checks matter: the values are placed into a database filter.
export function decodeCursor(value: string): Cursor {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof createdAt === "string" && typeof id === "string" && TIMESTAMP.test(createdAt) && UUID.test(id)) {
      return { createdAt, id };
    }
  } catch {
    // fall through to the error below
  }
  throw new ValidationError("The cursor is not valid");
}
