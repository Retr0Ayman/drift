import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import "./Tabs.css";

export interface TabDef {
  value: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabDef[];
  defaultValue: string;
  ariaLabel: string;
}

/* Radix Tabs for real tab semantics (roving focus, arrow-key nav,
   aria-selected/aria-controls wired automatically), styled via
   [data-state=active] rather than SegmentedControl's Motion layoutId pill --
   Radix Tabs mounts/unmounts panel content on switch, which doesn't pair
   as cleanly with a layoutId-tracked sliding background as ToggleGroup's
   always-mounted items do. Used to break the game detail page's long
   vertical stack of boxes into discrete panels instead of everything
   always being on screen at once. */
export default function Tabs({ tabs, defaultValue, ariaLabel }: TabsProps) {
  return (
    <RadixTabs.Root defaultValue={defaultValue} className="dtabs">
      <RadixTabs.List className="dtabs-list" aria-label={ariaLabel}>
        {tabs.map((t) => (
          <RadixTabs.Trigger key={t.value} value={t.value} className="dtabs-trigger">
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className="dtabs-panel">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
