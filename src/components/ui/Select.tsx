import * as RadixSelect from "@radix-ui/react-select";
import "./Select.css";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
}

export default function Select({ value, onChange, options, ariaLabel }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger className="dselect-trigger" aria-label={ariaLabel}>
        <RadixSelect.Value />
        <RadixSelect.Icon className="dselect-icon">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="dselect-content" position="popper" sideOffset={8}>
          <RadixSelect.ScrollUpButton className="dselect-scroll" />
          <RadixSelect.Viewport className="dselect-viewport">
            {options.map((opt) => (
              <RadixSelect.Item key={opt.value} value={opt.value} className="dselect-item">
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="dselect-indicator">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5 5 9.5 10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="dselect-scroll" />
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
