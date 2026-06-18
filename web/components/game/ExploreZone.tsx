"use client";
import { useId, useState } from "react";

// Progressive-disclosure wrapper for the post-game deep tools (Scouting / What-If Lab / Compare).
// They sit BELOW the Share CTA so a first-time mobile visitor reaches the growth loop without
// scrolling past a wall of analysis. Three deliberate properties:
//   • lazy children — the panel element is always in the DOM (so aria-controls always resolves),
//     but its CHILDREN mount only on first open, so a cold permalink viewer who never expands it
//     doesn't fire the tools' on-mount fetches (/api/evaluate etc.). Once opened the subtree
//     persists (hidden on collapse) so in-progress What-If swaps / friend comparisons survive.
//   • NO transform/filter/will-change on the wrapper. A held transform computes to an identity
//     matrix that makes the element a containing block for position:fixed descendants — which would
//     strand CompareLineup's fixed overlay and the share bottom-sheet (the globals.css rise-in bug).
//     The reveal is an instant `hidden` toggle; the global prefers-reduced-motion rule covers motion.
//   • onOpen is a discovery signal — fired once, on the first open only.
export function ExploreZone({ summary, children, defaultOpen = false, onOpen }: {
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
}) {
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const panelId = `${baseId}-panel`;
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) { if (!everOpened) onOpen?.(); setEverOpened(true); }
  }

  return (
    <div className="border-t border-zinc-800">
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-zinc-300 transition hover:text-orange-300"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-zinc-500">{open ? "▴" : "▾"}</span>
          {open ? "Show less" : "Explore your five"}
        </span>
        {!open && summary && (
          <span className="truncate text-[11px] font-normal normal-case tracking-normal text-zinc-600">{summary}</span>
        )}
      </button>
      {/* Panel is always in the DOM so aria-controls always resolves; aria-label is stable (the
          button's text changes on toggle, so labelling the region by it would degrade its name). */}
      <div id={panelId} role="region" aria-label="Explore your five" hidden={!open} className="px-6 pb-5 pt-1">
        {everOpened && children}
      </div>
    </div>
  );
}
