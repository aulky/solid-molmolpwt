import { Minus, Plus } from "lucide-solid";

interface QtyStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (newValue: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export function QtyStepper(props: QtyStepperProps) {
  const minVal = () => props.min ?? 0;
  const maxVal = () => props.max ?? 99;

  const handleDec = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.disabled) return;
    if (props.value > minVal()) {
      props.onChange(props.value - 1);
    }
  };

  const handleInc = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.disabled) return;
    if (props.value < maxVal()) {
      props.onChange(props.value + 1);
    }
  };

  return (
    <div class="inline-flex items-center border border-[#E7D8C3] rounded-full bg-[#FFFDF8] overflow-hidden shadow-2xs">
      <button
        type="button"
        onClick={handleDec}
        disabled={props.disabled || props.value <= minVal()}
        class="w-8 h-8 flex items-center justify-center text-[#5B4638] hover:bg-[#F9EEDB] disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-95 cursor-pointer"
        title="Kurangi"
      >
        <Minus size={14} />
      </button>

      <span class="w-7 sm:w-8 text-center text-xs font-bold text-[#5B4638] select-none font-heading">
        {props.value}
      </span>

      <button
        type="button"
        onClick={handleInc}
        disabled={props.disabled || props.value >= maxVal()}
        class="w-8 h-8 flex items-center justify-center text-[#5B4638] hover:bg-[#F9EEDB] disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-95 cursor-pointer"
        title="Tambah"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
