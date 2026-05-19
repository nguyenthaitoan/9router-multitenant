import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    groupId: row.groupId || null,
    keyLimit: row.keyLimit ?? 0,
    keyUsedCost: row.keyUsedCost ?? 0,
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function getApiKeysByGroupId(groupId) {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys WHERE groupId = ? ORDER BY createdAt ASC`, [groupId]);
  return rows.map(rowToKey);
}

export async function createApiKey(name, machineId, groupId = null, keyLimit = 0) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
    groupId: groupId || null,
    keyLimit: typeof keyLimit === "number" ? keyLimit : 0,
    keyUsedCost: 0,
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, groupId, keyLimit, keyUsedCost) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt, apiKey.groupId, apiKey.keyLimit, 0]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, groupId = ?, keyLimit = ?, keyUsedCost = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0,
       merged.groupId || null, merged.keyLimit ?? 0, merged.keyUsedCost ?? 0, id]
    );
    result = merged;
  });
  return result;
}

/**
 * Atomically increment keyUsedCost for a key. Returns new keyUsedCost.
 */
export async function incrementApiKeyCost(keyStr, costDelta) {
  if (!keyStr || !costDelta || costDelta <= 0) return null;
  const db = await getAdapter();
  let newUsed = null;
  db.transaction(() => {
    const row = db.get(`SELECT id, keyUsedCost FROM apiKeys WHERE key = ?`, [keyStr]);
    if (!row) return;
    newUsed = (row.keyUsedCost ?? 0) + costDelta;
    db.run(`UPDATE apiKeys SET keyUsedCost = ? WHERE id = ?`, [newUsed, row.id]);
  });
  return newUsed;
}

/**
 * Reset keyUsedCost to 0 for a key (admin action).
 */
export async function resetApiKeyCost(id) {
  return await updateApiKey(id, { keyUsedCost: 0 });
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}

/**
 * Get full API key record by key string (used for quota lookup).
 * Returns null if not found.
 */
export async function getApiKeyByKey(key) {
  if (!key) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}
