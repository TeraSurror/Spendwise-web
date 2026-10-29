"use client";

import { useState, useTransition } from "react";

/** A text field that saves on blur or Enter. */
export function InlineText({ value, onSave, label, className = "" }: { value: string; onSave: (v: string) => Promise<void>; label: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <input
      aria-label={label}
      defaultValue={value}
      disabled={pending}
      className={`input py-1 ${className}`}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => { const v = e.target.value; if (v !== value) start(() => onSave(v)); }}
    />
  );
}

export function InlineSelect({ value, options, onSave, label }: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<void>;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select aria-label={label} className="input py-1" value={value} disabled={pending} onChange={(e) => { const v = e.target.value; start(() => onSave(v)); }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function InlineCheckbox({ checked, onSave, label }: { checked: boolean; onSave: (v: boolean) => Promise<void>; label: string }) {
  const [pending, start] = useTransition();
  return <input type="checkbox" aria-label={label} checked={checked} disabled={pending} onChange={(e) => { const v = e.target.checked; start(() => onSave(v)); }} />;
}

/** A small button that asks before running, and shows the action's error if it throws. */
export function ActionButton({ onClick, children, confirmText, className = "text-accent text-xs" }: {
  onClick: () => Promise<unknown>;
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          start(async () => {
            try {
              setError(null);
              const r = await onClick();
              setDone(typeof r === "number" ? `${r} updated` : null);
            } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          });
        }}
      >{pending ? "…" : children}</button>
      {error && <span className="text-critical text-xs">{error}</span>}
      {done && <span className="text-ink-2 text-xs">{done}</span>}
    </span>
  );
}
