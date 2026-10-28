"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubmitButton({ children, className = "btn btn-primary", pendingText, confirm }: { children: ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);
  if (confirm && !armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? (pendingText ?? "Working…") : confirm && armed ? confirm : children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm copy-btn"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => setDone(false));
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function NavLink({ href, children, exact, badge, locked }: { href: string; children: ReactNode; exact?: boolean; badge?: number; locked?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={`nav-link${active ? " active" : ""}`}>
      <span>{children}</span>
      {locked ? <span className="lock">Growth</span> : badge ? <span className="nav-count">{badge}</span> : null}
    </Link>
  );
}

export function AutoSubmitSelect({ name, defaultValue, options, className }: { name: string; defaultValue: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
