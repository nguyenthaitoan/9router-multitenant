"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardSkeleton, Input, Modal, Toggle, ConfirmModal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

function emptyForm() {
  return {
    name: "",
    description: "",
    costLimit: 0,
    allowedConnectionIds: [],
    isActive: true,
  };
}

function fmtUsd(n) {
  if (n == null || isNaN(n)) return "$0.00";
  return `$${Number(n).toFixed(4)}`;
}

export default function GroupsPageClient() {
  const [groups, setGroups] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const notify = useNotificationStore();

  const fetchAll = useCallback(async () => {
    try {
      const [groupsRes, connsRes] = await Promise.all([
        fetch("/api/groups?includeKeys=true", { cache: "no-store" }).then(r => r.ok ? r.json() : { groups: [] }),
        fetch("/api/providers", { cache: "no-store" }).then(r => r.ok ? r.json() : { connections: [] }),
      ]);
      setGroups(groupsRes.groups || []);
      // Flatten connections list
      const flat = (connsRes.connections || []).map(c => ({
        id: c.id,
        label: `${c.provider} · ${c.name || c.email || c.id?.slice(0, 8) || "Account"}`,
      }));
      setConnections(flat);
    } catch (e) {
      console.log("Error fetching groups:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowFormModal(true);
  };

  const openEdit = (g) => {
    setEditing(g);
    setForm({
      name: g.name || "",
      description: g.description || "",
      costLimit: g.costLimit || 0,
      allowedConnectionIds: g.allowedConnectionIds || [],
      isActive: g.isActive !== false,
    });
    setShowFormModal(true);
  };

  const closeForm = () => {
    setShowFormModal(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const save = async () => {
    if (!form.name.trim()) {
      notify.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/groups/${editing.id}` : "/api/groups";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description,
          costLimit: Number(form.costLimit) || 0,
          allowedConnectionIds: form.allowedConnectionIds,
          isActive: form.isActive,
        }),
      });
      if (res.ok) {
        await fetchAll();
        closeForm();
        notify.success(editing ? "Group updated" : "Group created");
      } else {
        const data = await res.json();
        notify.error(data.error || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = (g) => {
    setConfirm({
      title: "Delete Group",
      message: `Delete group "${g.name}"? API keys in this group will be detached (lose group access).`,
      onConfirm: async () => {
        setConfirm(null);
        const res = await fetch(`/api/groups/${g.id}`, { method: "DELETE" });
        if (res.ok) {
          notify.success("Group deleted");
          fetchAll();
        } else {
          notify.error("Failed to delete");
        }
      },
    });
  };

  const reset = (g) => {
    setConfirm({
      title: "Reset Group Cost",
      message: `Reset usedCost of "${g.name}" to $0? This re-enables all keys in this group.`,
      onConfirm: async () => {
        setConfirm(null);
        const res = await fetch(`/api/groups/${g.id}/reset`, { method: "POST" });
        if (res.ok) {
          notify.success("Cost reset to $0");
          fetchAll();
        } else {
          notify.error("Failed to reset");
        }
      },
    });
  };

  const toggleActive = async (g, isActive) => {
    const res = await fetch(`/api/groups/${g.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) fetchAll();
  };

  const resetKeyCost = (keyId, keyName) => {
    setConfirm({
      title: "Reset Key Cost",
      message: `Reset cost of key "${keyName}" to $0?`,
      onConfirm: async () => {
        setConfirm(null);
        const res = await fetch(`/api/keys/${keyId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resetCost: true }),
        });
        if (res.ok) { notify.success("Key cost reset"); fetchAll(); }
        else notify.error("Failed to reset key cost");
      },
    });
  };

  const toggleConn = (id) => {
    setForm(prev => {
      const next = new Set(prev.allowedConnectionIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, allowedConnectionIds: [...next] };
    });
  };

  if (loading) return <CardSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Groups</h2>
            <p className="text-sm text-text-muted">Multi-tenant isolation: each group has its own quota and connection whitelist.</p>
          </div>
          <Button icon="add" onClick={openCreate}>New Group</Button>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <span className="material-symbols-outlined text-[48px] mb-2 block">groups</span>
            <p>No groups yet. Create one to isolate quota & connections per customer.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {groups.map((g) => {
              const pct = g.costLimit > 0 ? Math.min(100, (g.usedCost / g.costLimit) * 100) : 0;
              const exhausted = g.exhausted;
              return (
                <div key={g.id} className="group flex flex-col py-4 border-b border-black/[0.03] dark:border-white/[0.03] last:border-b-0">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{g.name}</p>
                        {!g.isActive && <Badge variant="default" size="sm">Disabled</Badge>}
                        {exhausted && <Badge variant="error" size="sm">Quota Exhausted</Badge>}
                      </div>
                      {g.description && <p className="text-xs text-text-muted mt-1">{g.description}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
                        <span>{g.keyCount || 0} key{(g.keyCount || 0) === 1 ? "" : "s"}</span>
                        <span>{(g.allowedConnectionIds || []).length === 0 ? "All connections" : `${g.allowedConnectionIds.length} conn whitelisted`}</span>
                        <span>
                          Used: {fmtUsd(g.usedCost)} / {g.costLimit > 0 ? `$${g.costLimit.toFixed(2)}` : "∞"}
                        </span>
                      </div>
                      {g.costLimit > 0 && (
                        <div className="mt-2 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${exhausted ? "bg-red-500" : pct > 80 ? "bg-orange-500" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      {/* Per-key breakdown */}
                      {g.keys && g.keys.length > 0 && (
                        <div className="mt-3 flex flex-col gap-1">
                          {g.keys.map(k => {
                            const kPct = k.keyLimit > 0 ? Math.min(100, (k.keyUsedCost / k.keyLimit) * 100) : 0;
                            const kExhausted = k.keyLimit > 0 && k.keyUsedCost >= k.keyLimit;
                            return (
                              <div key={k.id} className="flex items-center gap-2 text-xs text-text-muted">
                                <span className="w-32 truncate font-mono">{k.name}</span>
                                <span className={kExhausted ? "text-red-500" : ""}>
                                  {fmtUsd(k.keyUsedCost)} / {k.keyLimit > 0 ? `$${k.keyLimit.toFixed(2)}` : "∞"}
                                </span>
                                {k.keyLimit > 0 && (
                                  <div className="flex-1 h-1 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div className={`h-full ${kExhausted ? "bg-red-500" : "bg-primary/60"}`} style={{ width: `${kPct}%` }} />
                                  </div>
                                )}
                                <button
                                  onClick={() => resetKeyCost(k.id, k.name)}
                                  className="text-text-muted hover:text-primary"
                                  title="Reset key cost"
                                >
                                  <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Toggle
                        size="sm"
                        checked={g.isActive}
                        onChange={(checked) => toggleActive(g, checked)}
                      />
                      <Button size="sm" variant="ghost" icon="restart_alt" onClick={() => reset(g)}>Reset</Button>
                      <Button size="sm" variant="ghost" icon="edit" onClick={() => openEdit(g)}>Edit</Button>
                      <button
                        onClick={() => remove(g)}
                        className="p-2 hover:bg-red-500/10 rounded text-red-500"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <Modal
        isOpen={showFormModal}
        title={editing ? "Edit Group" : "Create Group"}
        onClose={closeForm}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Group Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Customer A"
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            label="Cost Limit (USD, 0 = unlimited)"
            type="number"
            step="0.01"
            min="0"
            value={form.costLimit}
            onChange={(e) => setForm({ ...form, costLimit: e.target.value })}
          />

          <div>
            <label className="text-sm font-medium mb-2 block">Allowed Connections</label>
            <p className="text-xs text-text-muted mb-2">
              Empty = allow all. Otherwise group can only use selected connections.
            </p>
            <div className="max-h-64 overflow-y-auto border border-border rounded p-2 flex flex-col gap-1">
              {connections.length === 0 ? (
                <p className="text-xs text-text-muted">No connections found. Add provider connections first.</p>
              ) : connections.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded px-2">
                  <input
                    type="checkbox"
                    checked={form.allowedConnectionIds.includes(c.id)}
                    onChange={() => toggleConn(c.id)}
                  />
                  <span className="text-sm">{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Active</span>
            <Toggle checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} fullWidth disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : (editing ? "Save" : "Create")}
            </Button>
            <Button onClick={closeForm} variant="ghost" fullWidth>Cancel</Button>
          </div>
        </div>
      </Modal>

      {confirm && (
        <ConfirmModal
          isOpen={!!confirm}
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
