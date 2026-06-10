import type { RefObject, KeyboardEvent } from "react";

// Common Tab-cycle focus trap for aria-modal dialogs.
// The container (tabIndex=-1) holds focus on open, so it counts as "first" for Shift+Tab.
// forwardFromContainer: set true when the container should also wrap forward-Tab (bpRef, sgRef).
// selector: focusable elements to trap within (default: buttons; sg needs inputs too).
export function buildFocusTrapHandler<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onEscape: (e: KeyboardEvent<T>) => void,
  opts: { forwardFromContainer?: boolean; selector?: string } = {},
): (e: KeyboardEvent<T>) => void {
  const selector = opts.selector ?? "button:not([disabled])";
  const forwardFromContainer = opts.forwardFromContainer ?? false;

  return (e: KeyboardEvent<T>) => {
    if (e.key === "Escape") { onEscape(e); return; }
    if (e.key === "Tab") {
      const f = ref.current?.querySelectorAll<HTMLElement>(selector);
      if (!f || f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      // aria-modal claims modality — actually trap Tab within the dialog's focusable elements.
      // The container itself holds focus right after opening (tabIndex=-1), so it counts
      // as "first" for Shift+Tab — otherwise focus would walk out the back of the dialog.
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || (forwardFromContainer && document.activeElement === ref.current))) { e.preventDefault(); first.focus(); }
    }
  };
}
