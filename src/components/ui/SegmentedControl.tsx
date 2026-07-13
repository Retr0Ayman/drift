import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { motion } from "motion/react";
import "./SegmentedControl.css";

interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

/* Radix ToggleGroup for real single-select semantics (roving focus, arrow-key
   nav, aria-pressed) -- fully custom-styled, one sliding pill behind the
   active option via Motion's layoutId (the standard "magic motion" tab-
   indicator pattern: the pill remembers its last position across
   unmount/remount and animates from there, no manual position math needed). */
export default function SegmentedControl({ options, value, onChange, ariaLabel }: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="seg"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <ToggleGroup.Item key={opt.value} value={opt.value} className="seg-item">
          {value === opt.value && (
            <motion.span
              layoutId="seg-pill"
              className="seg-pill"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <span className="seg-label">{opt.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
