import { NextResponse } from "next/server";
import { getGroupById, updateGroup, deleteGroup, getApiKeysByGroupId } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/groups/[id]
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const group = await getGroupById(id);
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    const keys = await getApiKeysByGroupId(id);
    return NextResponse.json({ group: { ...group, keys } });
  } catch (error) {
    console.log("Error fetching group:", error);
    return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 });
  }
}

// PUT /api/groups/[id] - Update group (name, description, costLimit, allowedConnectionIds, isActive)
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await getGroupById(id);
    if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const updateData = {};
    if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim();
    if (typeof body.description === "string") updateData.description = body.description;
    if (typeof body.costLimit === "number" && body.costLimit >= 0) updateData.costLimit = body.costLimit;
    if (Array.isArray(body.allowedConnectionIds)) updateData.allowedConnectionIds = body.allowedConnectionIds;
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;

    const updated = await updateGroup(id, updateData);
    return NextResponse.json({ group: updated });
  } catch (error) {
    console.log("Error updating group:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

// DELETE /api/groups/[id]
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const ok = await deleteGroup(id);
    if (!ok) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    return NextResponse.json({ message: "Group deleted (API keys detached)" });
  } catch (error) {
    console.log("Error deleting group:", error);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
