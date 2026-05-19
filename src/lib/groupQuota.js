// Group quota enforcement helpers — used by chat handler and auth layer
import { getGroupByApiKey, incrementGroupCost } from "@/lib/db";
import { getApiKeyByKey, incrementApiKeyCost } from "@/lib/db";

/**
 * Resolve the group for a given API key.
 * Returns null if the key has no group (legacy/default → full access, no quota).
 */
export async function resolveGroupForKey(apiKey) {
  if (!apiKey) return null;
  try {
    return await getGroupByApiKey(apiKey);
  } catch (e) {
    console.error("[groupQuota] resolveGroupForKey error:", e);
    return null;
  }
}

/**
 * Resolve the API key record (for per-key limit check).
 */
export async function resolveKeyRecord(apiKey) {
  if (!apiKey) return null;
  try {
    return await getApiKeyByKey(apiKey);
  } catch (e) {
    console.error("[groupQuota] resolveKeyRecord error:", e);
    return null;
  }
}

/**
 * Check per-key soft limit.
 * Returns { allowed: boolean, reason?: string }
 */
export function checkKeyLimit(keyRecord) {
  if (!keyRecord) return { allowed: true };
  const { keyLimit, keyUsedCost, name } = keyRecord;
  if (keyLimit > 0 && keyUsedCost >= keyLimit) {
    return {
      allowed: false,
      reason: `Key "${name}" quota exceeded: $${keyUsedCost.toFixed(4)} / $${keyLimit.toFixed(2)}`,
      keyRecord,
    };
  }
  return { allowed: true, keyRecord };
}

/**
 * Check if a group is currently allowed to make requests.
 * Returns { allowed: boolean, reason?: string, group?: object }
 */
export function checkGroupQuota(group) {
  if (!group) return { allowed: true };
  if (!group.isActive) {
    return { allowed: false, reason: "Group is disabled", group };
  }
  if (group.costLimit > 0 && group.usedCost >= group.costLimit) {
    return {
      allowed: false,
      reason: `Group "${group.name}" quota exceeded: $${group.usedCost.toFixed(4)} / $${group.costLimit.toFixed(2)}`,
      group,
    };
  }
  return { allowed: true, group };
}

/**
 * Check if a connection ID is allowed for the group.
 * If group has empty allowedConnectionIds → all connections allowed.
 */
export function isConnectionAllowedForGroup(group, connectionId) {
  if (!group) return true;
  const allowed = group.allowedConnectionIds || [];
  if (allowed.length === 0) return true;
  return allowed.includes(connectionId);
}

/**
 * Filter a list of provider connections to only those allowed by group.
 */
export function filterConnectionsByGroup(connections, group) {
  if (!group) return connections;
  const allowed = group.allowedConnectionIds || [];
  if (allowed.length === 0) return connections;
  return connections.filter((c) => allowed.includes(c.id));
}

/**
 * Add cost to both group quota and per-key counter. Fire-and-forget.
 */
export async function addCostToGroupAndKey(groupId, apiKey, costDelta) {
  if (!costDelta || costDelta <= 0) return;
  const tasks = [];
  if (groupId) tasks.push(incrementGroupCost(groupId, costDelta).catch(e => console.error("[groupQuota] group cost error:", e)));
  if (apiKey) tasks.push(incrementApiKeyCost(apiKey, costDelta).catch(e => console.error("[groupQuota] key cost error:", e)));
  await Promise.all(tasks);
}

// Legacy alias
export async function addCostToGroup(groupId, costDelta) {
  if (!groupId || !costDelta || costDelta <= 0) return;
  try {
    await incrementGroupCost(groupId, costDelta);
  } catch (e) {
    console.error("[groupQuota] addCostToGroup error:", e);
  }
}
