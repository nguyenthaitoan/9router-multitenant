// Group quota enforcement helpers — used by chat handler and auth layer
import { getGroupByApiKey, incrementGroupCost } from "@/lib/db";

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
 * Check if a group is currently allowed to make requests.
 * Returns { allowed: boolean, reason?: string, group?: object }
 */
export function checkGroupQuota(group) {
  if (!group) return { allowed: true };           // No group = no quota
  if (!group.isActive) {
    return { allowed: false, reason: "Group is disabled", group };
  }
  if (group.costLimit > 0 && group.usedCost >= group.costLimit) {
    return {
      allowed: false,
      reason: `Quota exceeded: $${group.usedCost.toFixed(4)} / $${group.costLimit.toFixed(2)}`,
      group,
    };
  }
  return { allowed: true, group };
}

/**
 * Check if a connection ID is allowed for the group.
 * If group has empty allowedConnectionIds → all connections allowed (group exists for quota only).
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
 * Add cost to group's running total. Fire-and-forget on errors.
 */
export async function addCostToGroup(groupId, costDelta) {
  if (!groupId || !costDelta || costDelta <= 0) return;
  try {
    await incrementGroupCost(groupId, costDelta);
  } catch (e) {
    console.error("[groupQuota] addCostToGroup error:", e);
  }
}
