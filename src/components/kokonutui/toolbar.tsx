/**
 * Adapted from Kokonut UI Toolbar.
 * @author: @dorianbaffier
 * @license: MIT
 * @website: https://kokonutui.com
 */

import { FileDown, type LucideIcon, Lock, MousePointer2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ToolbarItem {
  id: string;
  title: string;
  icon: LucideIcon;
}

interface ToolbarProps {
  activeColor?: string;
  className?: string;
  defaultSelected?: string;
  items?: ToolbarItem[];
  onSelect?: (itemId: string) => void;
}

const defaultToolbarItems: ToolbarItem[] = [
  { id: "query", title: "Query", icon: MousePointer2 },
  { id: "secure", title: "Secure", icon: Lock },
  { id: "export", title: "Export", icon: FileDown }
];

export function Toolbar({
  activeColor = "text-teal-700",
  className,
  defaultSelected = "query",
  items = defaultToolbarItems,
  onSelect
}: ToolbarProps) {
  const [selected, setSelected] = useState<string | null>(defaultSelected);
  const [activeNotification, setActiveNotification] = useState<string | null>(null);

  function handleItemClick(itemId: string) {
    setSelected(itemId);
    onSelect?.(itemId);
    setActiveNotification(itemId);
    window.setTimeout(() => setActiveNotification(null), 900);
  }

  return (
    <div className={cn("kokonut-toolbar-wrap relative", className)}>
      <AnimatePresence>
        {activeNotification ? (
          <motion.div
            animate={{ opacity: 1, y: -8 }}
            className="pointer-events-none absolute -top-7 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--ink)] px-3 py-1 text-[11px] text-white shadow"
            exit={{ opacity: 0, y: -14 }}
            initial={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {items.find((item) => item.id === activeNotification)?.title}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white/90 p-1 shadow-sm">
        {items.map((item) => {
          const Icon = item.icon;
          const isSelected = selected === item.id;

          return (
            <motion.button
              animate={{
                gap: isSelected ? 8 : 0,
                paddingLeft: isSelected ? 12 : 9,
                paddingRight: isSelected ? 12 : 9
              }}
              className={cn(
                "relative flex h-9 items-center overflow-hidden rounded-lg text-sm transition",
                isSelected ? "bg-teal-50 text-teal-800" : "text-[var(--muted)] hover:bg-neutral-100 hover:text-[var(--ink)]",
                isSelected && activeColor
              )}
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              transition={{ type: "spring", bounce: 0, duration: 0.28 }}
              type="button"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <AnimatePresence initial={false}>
                {isSelected ? (
                  <motion.span
                    animate={{ opacity: 1, width: "auto" }}
                    className="overflow-hidden whitespace-nowrap"
                    exit={{ opacity: 0, width: 0 }}
                    initial={{ opacity: 0, width: 0 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.24 }}
                  >
                    {item.title}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default Toolbar;
