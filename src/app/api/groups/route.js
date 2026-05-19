import { NextResponse } from "next/server";
import { getGroups, createGroup, getApiKeysByGroupId } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/groups - List all groups (with key counts)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const filter = {};
    if (isActive === "true") filter.isActive = true;
    if (isActive === "false") filter.isActive = false;

    const groups = await getGroups(filter);

    // Enrich with key count + computed status
    const enriched = await Promise.all(groups.map(async (g) => {
      const keys = await getApiKeysByGroupId(g.id);
      const remaining = g.costLimit > 0 ? Math.max(0, g.costLimit - g.usedCost) : null;
      const exhausted = g.costLimit > 0 && g.usedCost >= g.costLimit;
      return {
        ...g,
        keyCount: keys.length,
        remaining,
        exhausted,
      };
    }));

    return NextResponse.json({ groups: enriched });
  } catch (error) {
    console.log("Error fetching groups:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

// POST /api/groups - Create new group
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, description, costLimit, allowedConnectionIds } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const group = await createGroup({
      name: name.trim(),
      description: description || "",
      costLimit: typeof costLimit === "number" && costLimit >= 0 ? costLimit : 0,
      allowedConnectionIds: Array.isArray(allowedConnectionIds) ? allowedConnectionIds : [],
      isActive: true,
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.log("Error creating group:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
