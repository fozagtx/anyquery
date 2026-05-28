/**
 * Adapted from Kokonut UI Action Search Bar.
 * @author: @kokonutui
 * @license: MIT
 * @website: https://kokonutui.com
 */

import { Search, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { KeyboardEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import useDebounce from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

export interface ActionSearchAction {
  id: string;
  label: string;
  icon: ReactNode;
  description?: string;
  short?: string;
  end?: string;
  value?: string;
}

interface SearchResult {
  actions: ActionSearchAction[];
}

interface ActionSearchBarProps {
  actions?: ActionSearchAction[];
  className?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  footer?: string;
  label?: string;
  placeholder?: string;
  value: string;
  onActionSelect?: (action: ActionSearchAction) => void;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

const animationVariants = {
  container: {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: {
        height: { duration: 0.24 },
        staggerChildren: 0.04
      }
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: { duration: 0.2 },
        opacity: { duration: 0.14 }
      }
    }
  },
  item: {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.18 }
    },
    exit: {
      opacity: 0,
      y: -6,
      transition: { duration: 0.14 }
    }
  }
} as const;

export default function ActionSearchBar({
  actions = [],
  className,
  defaultOpen = false,
  disabled = false,
  footer = "Enter to run, Escape to close",
  label = "Query Coral",
  placeholder = "Ask with SQL or AIsa natural language",
  value,
  onActionSelect,
  onChange,
  onSubmit
}: ActionSearchBarProps) {
  const [isFocused, setIsFocused] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounce(value, 160);

  const filteredActions = useMemo(() => {
    if (!debouncedQuery) return actions;

    const normalizedQuery = debouncedQuery.toLowerCase().trim();
    return actions.filter((action) => {
      const searchableText = `${action.label} ${action.description ?? ""} ${action.value ?? ""}`.toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [debouncedQuery, actions]);
  const result: SearchResult | null = isFocused ? { actions: filteredActions } : null;

  function selectAction(action: ActionSearchAction) {
    onChange(action.value ?? action.label);
    onActionSelect?.(action);
    setIsFocused(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();

      if (result?.actions.length && activeIndex >= 0 && result.actions[activeIndex]) {
        selectAction(result.actions[activeIndex]);
        return;
      }

      onSubmit(value);
      return;
    }

    if (!result?.actions.length) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((previous) => (previous < result.actions.length - 1 ? previous + 1 : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((previous) => (previous > 0 ? previous - 1 : result.actions.length - 1));
        break;
      case "Escape":
        setIsFocused(false);
        setActiveIndex(-1);
        break;
    }
  }

  return (
    <div className={cn("kokonut-action-search mx-auto w-full", className)}>
      <div className="relative flex flex-col items-center justify-start">
        <div className="z-10 w-full bg-[var(--panel)]/95 pb-1">
          <label className="mb-2 block font-medium text-[var(--muted)] text-xs" htmlFor="query-composer">
            {label}
          </label>
          <div className="relative">
            <Input
              aria-activedescendant={activeIndex >= 0 ? `action-${result?.actions[activeIndex]?.id}` : undefined}
              aria-autocomplete="list"
              aria-expanded={isFocused && !!result}
              autoComplete="off"
              className="h-12 rounded-xl border-[var(--line)] bg-white py-2 pr-12 pl-4 text-sm text-[var(--ink)] focus-visible:ring-teal-700/20"
              disabled={disabled}
              id="query-composer"
              onBlur={() => window.setTimeout(() => setIsFocused(false), 160)}
              onChange={(event) => {
                onChange(event.target.value);
                setActiveIndex(-1);
              }}
              onFocus={() => setIsFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              role="combobox"
              type="text"
              value={value}
            />
            <button
              aria-label="Run query"
              className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg border border-[var(--line)] bg-[var(--ink)] text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              onClick={() => onSubmit(value)}
              type="button"
            >
              <AnimatePresence mode="popLayout">
                {value.length > 0 ? (
                  <motion.span
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 12, opacity: 0 }}
                    initial={{ y: -12, opacity: 0 }}
                    key="send"
                    transition={{ duration: 0.18 }}
                  >
                    <Send className="h-4 w-4" />
                  </motion.span>
                ) : (
                  <motion.span
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 12, opacity: 0 }}
                    initial={{ y: -12, opacity: 0 }}
                    key="search"
                    transition={{ duration: 0.18 }}
                  >
                    <Search className="h-4 w-4" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>

        <div className="w-full">
          <AnimatePresence>
            {isFocused && result && result.actions.length > 0 ? (
              <motion.div
                animate="show"
                aria-label="Query suggestions"
                className="mt-2 w-full overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[var(--shadow)]"
                exit="exit"
                initial="hidden"
                role="listbox"
                variants={animationVariants.container}
              >
                <motion.ul className="p-1" role="none">
                  {result.actions.map((action, index) => (
                    <motion.li
                      aria-selected={activeIndex === index}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 transition",
                        activeIndex === index ? "bg-teal-50" : "hover:bg-neutral-100"
                      )}
                      id={`action-${action.id}`}
                      key={action.id}
                      layout
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectAction(action);
                      }}
                      role="option"
                      variants={animationVariants.item}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="shrink-0 text-[var(--accent)]">
                          {action.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[var(--ink)] text-sm">{action.label}</span>
                          {action.description ? (
                            <span className="block truncate text-[var(--muted)] text-xs">{action.description}</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {action.short ? <span className="text-[var(--muted)] text-xs">{action.short}</span> : null}
                        {action.end ? <span className="text-right text-[var(--muted)] text-xs">{action.end}</span> : null}
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
                <div className="border-[var(--line)] border-t px-3 py-2">
                  <div className="flex items-center justify-between text-[var(--muted)] text-xs">
                    <span>{footer}</span>
                    <span>Esc</span>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
