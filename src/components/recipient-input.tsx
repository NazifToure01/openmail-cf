"use client";

import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { dedupeAddresses, displayName, formatAddress, isValidEmail, parseAddressList } from "@/lib/addresses";
import type { Address, Contact } from "@/lib/types";
import { cn } from "./ui";

export function RecipientInput({
  label,
  value,
  onChange,
  contacts,
  autoFocus,
  trailing,
  single,
}: {
  label: string;
  value: Address[];
  onChange: (list: Address[]) => void;
  contacts: Contact[];
  autoFocus?: boolean;
  trailing?: React.ReactNode;
  single?: boolean;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value.map((v) => v.address));
    return contacts
      .filter((c) => !taken.has(c.address) && (c.address.includes(q) || (c.name ?? "").toLowerCase().includes(q)))
      .slice(0, 6);
  }, [text, contacts, value]);


  const commit = (raw = text) => {
    const parsed = parseAddressList(raw);
    if (parsed.length) {
      const enriched = parsed.map((a) => {
        const known = contacts.find((c) => c.address === a.address);
        return a.name || !known?.name ? a : { ...a, name: known.name };
      });
      onChange(single ? enriched.slice(-1) : dedupeAddresses([...value, ...enriched]));
    }
    setText("");
  };

  const pick = (c: Contact) => {
    const entry = { address: c.address, ...(c.name ? { name: c.name } : {}) };
    onChange(single ? [entry] : dedupeAddresses([...value, entry]));
    setText("");
    inputRef.current?.focus();
  };

  const open = focused && suggestions.length > 0;

  return (
    <div className="relative flex min-h-11 items-start gap-2 border-b border-line px-4 py-1.5" onClick={() => inputRef.current?.focus()}>
      <span className="w-14 shrink-0 pt-1.5 text-[13px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {value.map((a) => {
          const valid = isValidEmail(a.address);
          return (
            <span
              key={a.address}
              title={formatAddress(a)}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[13px]",
                valid ? "bg-surface-2 text-fg" : "bg-danger-soft text-danger",
              )}
            >
              <span className="truncate">{displayName(a)}</span>
              {a.name && <span className="hidden truncate text-subtle sm:inline">&lt;{a.address}&gt;</span>}
              <button
                type="button"
                aria-label={`Retirer ${a.address}`}
                className="rounded-full p-0.5 text-muted hover:bg-hover hover:text-fg"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v.address !== a.address));
                }}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        {!(single && value.length > 0) && (
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={text}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={label}
            onChange={(e) => {
              const v = e.target.value;
              if (/[,;\n]/.test(v)) commit(v);
              else {
                setText(v);
                setHighlight(0);
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (text.trim()) commit();
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (/[,;\n]/.test(pasted) || /<.+@.+>/.test(pasted)) {
                e.preventDefault();
                commit(text + pasted);
              }
            }}
            onKeyDown={(e) => {
              if (open && e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => (h + 1) % suggestions.length);
              } else if (open && e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Enter" || (e.key === "Tab" && text.trim())) {
                if (!text.trim()) return;
                e.preventDefault();
                if (open) pick(suggestions[Math.min(highlight, suggestions.length - 1)]);
                else commit();
              } else if (e.key === "Backspace" && !text && value.length) {
                onChange(value.slice(0, -1));
              } else if (e.key === "Escape" && text) {
                e.stopPropagation();
                setText("");
              }
            }}
            className="h-7 min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
            placeholder={value.length ? "" : "nom@exemple.com"}
          />
        )}
      </div>
      {trailing}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="animate-pop absolute left-16 right-4 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop"
        >
          {suggestions.map((c, i) => (
            <li
              key={c.address}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn("cursor-pointer px-3 py-2 text-sm", i === highlight && "bg-hover")}
            >
              <span className="font-medium">{c.name || c.address}</span>
              {c.name && <span className="ml-2 text-muted">{c.address}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
