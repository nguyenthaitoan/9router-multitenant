import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

/**
 * Groups represent multi-tenant isolation:
 *  - Each group has a quota (costLimit) and current usage (usedCost in $)
 *  - Each group has a whitelist of allowed providerConnection ids
 *  - Multiple API keys can belong to the same group (shared quota)
 *  - When usedCost >= costLimit > 0 → all keys in group are blocked
 *
 * Backward compat: API keys without a groupId behave as before (full access, no quota).
 */

function rowToGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    costLimit: row.costLimit ?? 0,
    usedCost: row.usedCost ?? 0,
    allowedConnectionIds: parseJson(row.allowedConnectionIds, []),
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getGroups(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.isActive !== undefined) {
    where.push("isActive = ?");
    params.push(filter.isActive ? 1 : 0);
  }
  const sql = `SELECT * FROM groups${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt ASC`;
  const rows = db.all(sql, params);
  return rows.map(rowToGroup);
}

export async function getGroupById(id) {
  if (!id) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM groups WHERE id = ?`, [id]);
  return rowToGroup(row);
}

export async function createGroup(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const group = {
    id: uuidv4(),
    name: data.name || "Unnamed group",
    description: data.description || "",
    costLimit: typeof data.costLimit === "number" ? data.costLimit : 0,
    usedCost: 0,
    allowedConnectionIds: Array.isArray(data.allowedConnectionIds) ? data.allowedConnectionIds : [],
    isActive: data.isActive !== false,
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO groups(id, name, description, costLimit, usedCost, allowedConnectionIds, isActive, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      group.id, group.name, group.description, group.costLimit, group.usedCost,
      stringifyJson(group.allowedConnectionIds), group.isActive ? 1 : 0,
      group.createdAt, group.updatedAt
    ]
  );
  return group;
}

export async function updateGroup(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM groups WHERE id = ?`, [id]);
    if (!row) return;
    const existing = rowToGroup(row);
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() };
    db.run(
      `UPDATE groups SET name = ?, description = ?, costLimit = ?, usedCost = ?, allowedConnectionIds = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
      [
        merged.name, merged.description, merged.costLimit, merged.usedCost,
        stringifyJson(merged.allowedConnectionIds || []),
        merged.isActive ? 1 : 0, merged.updatedAt, id
      ]
    );
    result = merged;
  });
  return result;
}

export async function deleteGroup(id) {
  const db = await getAdapter();
  let ok = false;
  db.transaction(() => {
    // Detach API keys from this group first (set groupId = NULL)
    db.run(`UPDATE apiKeys SET groupId = NULL WHERE groupId = ?`, [id]);
    const res = db.run(`DELETE FROM groups WHERE id = ?`, [id]);
    ok = (res?.changes ?? 0) > 0;
  });
  return ok;
}

/**
 * Atomically add cost to a group. Returns the new usedCost.
 * Safe under concurrent writes via SQLite transaction.
 */
export async function incrementGroupCost(groupId, costDelta) {
  if (!groupId || !costDelta || costDelta <= 0) return null;
  const db = await getAdapter();
  let newUsed = null;
  db.transaction(() => {
    const row = db.get(`SELECT usedCost FROM groups WHERE id = ?`, [groupId]);
    if (!row) return;
    newUsed = (row.usedCost ?? 0) + costDelta;
    db.run(
      `UPDATE groups SET usedCost = ?, updatedAt = ? WHERE id = ?`,
      [newUsed, new Date().toISOString(), groupId]
    );
  });
  return newUsed;
}

/**
 * Reset usedCost to 0 (admin manual reset).
 */
export async function resetGroupCost(groupId) {
  return await updateGroup(groupId, { usedCost: 0 });
}

/**
 * Get group for an API key (returns null if key has no group).
 * Used by chat handler to enforce quota + filter connections.
 */
export async function getGroupByApiKey(apiKey) {
  if (!apiKey) return null;
  const db = await getAdapter();
  const row = db.get(
    `SELECT g.* FROM groups g
     INNER JOIN apiKeys k ON k.groupId = g.id
     WHERE k.key = ? AND k.isActive = 1`,
    [apiKey]
  );
  return rowToGroup(row);
}
