import { JSX } from "solid-js";

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: JSX.Element;
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="card-surface p-4 sm:p-5 bg-[#FFF9EE] border border-[#E2CCA8] rounded-2xl flex items-start justify-between gap-2 shadow-xs">
      <div class="space-y-1 min-w-0 flex-1">
        <span class="text-xs font-semibold text-[#806B5C] uppercase tracking-wider block truncate">
          {props.label}
        </span>
        <div class="font-heading font-bold text-xl sm:text-2xl lg:text-3xl text-[#5B4638] break-words">
          {props.value}
        </div>
        {props.sublabel && (
          <span class="text-xs text-[#806B5C] block truncate">
            {props.sublabel}
          </span>
        )}
      </div>

      {props.icon && (
        <div class="p-2 sm:p-2.5 rounded-xl bg-[#D92D3A]/10 text-[#D92D3A] shrink-0">
          {props.icon}
        </div>
      )}
    </div>
  );
}
