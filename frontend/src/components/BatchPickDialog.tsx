import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { isExpired } from "@farm-sales/shared";
import { api } from "../lib/api.js";
import { formatDate } from "../lib/format.js";

// A bill line that is for an item tracked by batch and has no batch yet.
export interface BatchNeedLine {
  key: string;
  itemId: string;
  name: string;
  qty: number;
}

export interface BatchChoice {
  batchId: string;
  batchCode: string;
}

interface BatchOption {
  id: string;
  code: string;
  status: "ACTIVE" | "HOLD";
  bestBefore: string | null;
  stockBalances: { qty: string }[];
}

function inStock(batch: BatchOption): number {
  return batch.stockBalances.reduce((sum, b) => sum + Number(b.qty), 0);
}

// Asked for just before a bill is held or paid, when an item tracked by batch is on it. The
// cashier scans the batch label or types the batch code, or taps a batch from the list. Each
// line needs one batch with enough stock for the whole quantity.
export function BatchPickDialog({
  lines,
  onConfirm,
  onCancel,
}: {
  lines: BatchNeedLine[];
  onConfirm: (choices: Record<string, BatchChoice>) => void;
  onCancel: () => void;
}) {
  const [batchesByItem, setBatchesByItem] = useState<Record<string, BatchOption[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, BatchChoice>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  const itemIds = useMemo(() => [...new Set(lines.map((l) => l.itemId))], [lines]);

  useEffect(() => {
    Promise.all(itemIds.map((id) => api.get<BatchOption[]>(`/batches?itemId=${id}`)))
      .then((lists) => {
        const byItem: Record<string, BatchOption[]> = {};
        itemIds.forEach((id, i) => (byItem[id] = lists[i]));
        setBatchesByItem(byItem);
      })
      .catch(() => setLoadError("Could not load the batches. Check the connection and try again."));
  }, [itemIds]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Checks a batch against one line and records it, or says why it cannot be used.
  function choose(line: BatchNeedLine, batch: BatchOption) {
    let problem: string | null = null;
    if (batch.status !== "ACTIVE") problem = `Batch ${batch.code} is on hold and cannot be sold`;
    else if (isExpired(batch.bestBefore)) {
      problem = `Batch ${batch.code} expired on ${formatDate(batch.bestBefore)} and cannot be sold`;
    } else if (inStock(batch) < line.qty) {
      problem = `Only ${inStock(batch)} in batch ${batch.code}. This line needs ${line.qty}, all from one batch.`;
    }
    setMessages((m) => ({ ...m, [line.key]: problem ?? "" }));
    if (problem) {
      setChoices((c) => {
        const next = { ...c };
        delete next[line.key];
        return next;
      });
      return;
    }
    setChoices((c) => ({ ...c, [line.key]: { batchId: batch.id, batchCode: batch.code } }));
  }

  // A scanned or typed code: a batch code, or a pack label (its batch is the part before -0001).
  function submitCode(line: BatchNeedLine) {
    const code = (typed[line.key] ?? "").trim().toUpperCase().replace(/-\d{4}$/, "");
    if (!code) return;
    const batch = (batchesByItem[line.itemId] ?? []).find((b) => b.code.toUpperCase() === code);
    if (!batch) {
      setMessages((m) => ({ ...m, [line.key]: `"${code}" is not a batch of ${line.name}` }));
      return;
    }
    choose(line, batch);
  }

  const allChosen = lines.every((l) => choices[l.key]);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose batch"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13, 29, 20, .45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div className="card" style={{ width: "min(640px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
        <div style={{ padding: 18, borderBottom: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Choose the batch</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            These items are tracked by batch. Scan the batch label or type the batch code, or tap a batch below.
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {loadError && <div className="error-banner">{loadError}</div>}
          {lines.map((line) => {
            const chosen = choices[line.key];
            const options = (batchesByItem[line.itemId] ?? []).filter((b) => b.status === "ACTIVE" && !isExpired(b.bestBefore) && inStock(b) > 0);
            return (
              <section key={line.key} style={{ border: "1px solid var(--border-light)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <b>{line.name}</b>
                  <span className="muted">Qty {line.qty}</span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="in"
                    style={{ flex: 1, minHeight: 44 }}
                    placeholder="Scan the batch label, or type the batch code"
                    aria-label={`Batch code for ${line.name}`}
                    autoComplete="off"
                    autoFocus={lines[0]?.key === line.key}
                    value={typed[line.key] ?? ""}
                    onChange={(e) => setTyped((t) => ({ ...t, [line.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitCode(line);
                      }
                    }}
                  />
                  <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => submitCode(line)}>
                    Use
                  </button>
                </div>

                {messages[line.key] && <div className="error-banner">{messages[line.key]}</div>}

                {options.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div className="muted" style={{ fontSize: 12.5 }}>Or tap a batch</div>
                    {options.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => choose(line, b)}
                        aria-pressed={chosen?.batchId === b.id}
                        style={{
                          minHeight: 48, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "0 12px",
                          borderRadius: 10, textAlign: "left", cursor: "pointer", background: "#fff",
                          border: chosen?.batchId === b.id ? "2px solid #12301F" : "1px solid var(--border-light)",
                        }}
                      >
                        <span>
                          <b>{b.code}</b>
                          <span className="muted" style={{ fontSize: 12.5 }}> · best before {formatDate(b.bestBefore)}</span>
                        </span>
                        <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{inStock(b)} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
                {options.length === 0 && batchesByItem[line.itemId] && (
                  <div className="muted" style={{ fontSize: 13 }}>No batch of this item has stock to sell.</div>
                )}

                {chosen && <div style={{ color: "#14502F", fontWeight: 600, fontSize: 13.5 }}>Batch {chosen.batchCode} chosen</div>}
              </section>
            );
          })}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-light)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn" style={{ minHeight: 44 }} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn p" style={{ minHeight: 44 }} disabled={!allChosen} onClick={() => onConfirm(choices)}>
            {allChosen ? "Continue" : "Choose a batch for each item"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
