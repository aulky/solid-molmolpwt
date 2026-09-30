import { JSX } from "solid-js";

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: JSX.Element;
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="card-surface p-4 sm:p-5 bg-white border border-[#E8E8EC] flex items-start justify-between gap-2">
      <div class="space-y-1 min-w-0 flex-1">
        <span class="text-[11px] sm:text-xs font-mono text-[#6B6B6B] uppercase tracking-wider block truncate">
          {props.label}
        </span>
        <div class="font-heading font-bold text-xl sm:text-2xl lg:text-3xl text-[#0A0A0A] break-words">
          {props.value}
        </div>
        {props.sublabel && (
          <span class="text-[10px] sm:text-[11px] text-[#9C9C9C] block truncate">
            {props.sublabel}
          </span>
        )}
      </div>

      {props.icon && (
        <div class="p-2 sm:p-2.5 rounded-lg bg-[#6366F1]/10 text-[#6366F1] shrink-0">
          {props.icon}
        </div>
      )}
    </div>
  );
}
