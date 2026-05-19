import { NextResponse } from "next/server";
import { resetGroupCost, getGroupById } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/groups/[id]/reset - Reset usedCost to 0 (admin action)
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const existing = await getGroupById(id);
    if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    const updated = await resetGroupCost(id);
    return NextResponse.json({ group: updated, message: "Cost reset to $0" });
  } catch (error) {
    console.log("Error resetting group:", error);
    return NextResponse.json({ error: "Failed to reset group" }, { status: 500 });
  }
}
