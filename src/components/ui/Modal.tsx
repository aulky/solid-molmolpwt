import { JSX, Show, onMount, onCleanup } from "solid-js";
import { X } from "lucide-solid";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: string; // e.g. "max-w-lg", "max-w-xl", "max-w-2xl"
  children: JSX.Element;
}

export function Modal(props: ModalProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.isOpen) {
      props.onClose();
    }
  };

  onMount(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }
  });

  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleKeyDown);
    }
  });

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          class="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          onClick={props.onClose}
        />

        {/* Dialog Content */}
        <div class="flex min-h-full items-center justify-center p-2 sm:p-4 my-auto">
          <div
            class={`relative w-full ${
              props.maxWidth || "max-w-lg"
            } bg-white rounded-xl border border-[#E8E8EC] shadow-2xl p-4 sm:p-6 transition-all text-[#0A0A0A] max-h-[95vh] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="flex items-center justify-between pb-3 mb-3 border-b border-[#E8E8EC] shrink-0">
              <Show when={props.title}>
                <h3 class="font-heading font-semibold text-base sm:text-lg text-[#0A0A0A] truncate pr-2">
                  {props.title}
                </h3>
              </Show>
              <button
                type="button"
                onClick={props.onClose}
                class="text-[#6B6B6B] hover:text-[#0A0A0A] p-1.5 rounded-md hover:bg-black/5 transition cursor-pointer shrink-0"
                title="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div class="overflow-y-auto pr-1">{props.children}</div>
          </div>
        </div>
      </div>
    </Show>
  );
}
