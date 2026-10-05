import { JSX } from "solid-js";

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: JSX.Element;
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="card-surface p-4 sm:p-5 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl flex items-start justify-between gap-2 shadow-xs">
      <div class="space-y-1 min-w-0 flex-1">
        <span class="text-xs font-semibold text-[#8D7E73] uppercase tracking-wider block truncate">
          {props.label}
        </span>
        <div class="font-heading font-bold text-xl sm:text-2xl lg:text-3xl text-[#1C1917] break-words">
          {props.value}
        </div>
        {props.sublabel && (
          <span class="text-xs text-[#6C5F57] block truncate">
            {props.sublabel}
          </span>
        )}
      </div>

      {props.icon && (
        <div class="p-2 sm:p-2.5 rounded-xl bg-[#CE2738]/10 text-[#CE2738] shrink-0">
          {props.icon}
        </div>
      )}
    </div>
  );
}
