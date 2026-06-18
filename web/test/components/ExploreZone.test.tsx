// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { ExploreZone } from "@/components/game/ExploreZone";

afterEach(() => cleanup());

describe("ExploreZone — progressive disclosure for the post-game deep tools", () => {
  it("is collapsed by default and lazy: children are NOT mounted until first open", () => {
    const { queryByText, getByRole } = render(
      <ExploreZone summary="What-If · Compare">
        <div>DEEP_CONTENT</div>
      </ExploreZone>,
    );
    const btn = getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    // lazy children: a cold permalink viewer never fires the children's on-mount fetches
    expect(queryByText("DEEP_CONTENT")).toBeNull();
    // ...but the panel element itself is in the DOM, so aria-controls always resolves
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeTruthy();
  });

  it("reveals children and flips aria-expanded on open, wiring aria-controls to a labelled region", () => {
    const onOpen = vi.fn();
    const { getByRole, getByText } = render(
      <ExploreZone onOpen={onOpen}>
        <div>DEEP_CONTENT</div>
      </ExploreZone>,
    );
    const btn = getByRole("button");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(getByText("DEEP_CONTENT")).toBeTruthy();
    expect(onOpen).toHaveBeenCalledTimes(1);
    const panel = getByRole("region");
    expect(btn.getAttribute("aria-controls")).toBe(panel.getAttribute("id"));
    // stable region name — NOT derived from the mutable button text ("Show less")
    expect(panel.getAttribute("aria-label")).toBe("Explore your five");
  });

  it("keeps children mounted but hidden after collapsing (state persists across reopen)", () => {
    const { getByRole, getByText } = render(
      <ExploreZone>
        <div>DEEP_CONTENT</div>
      </ExploreZone>,
    );
    const btn = getByRole("button");
    fireEvent.click(btn); // open
    fireEvent.click(btn); // close
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    const content = getByText("DEEP_CONTENT"); // still in the DOM
    const panel = content.closest('[id$="-panel"]') as HTMLElement;
    expect(panel.hasAttribute("hidden")).toBe(true);
  });

  it("fires onOpen only on the FIRST open — a discovery signal, not a per-toggle event", () => {
    const onOpen = vi.fn();
    const { getByRole } = render(
      <ExploreZone onOpen={onOpen}>
        <div>X</div>
      </ExploreZone>,
    );
    const btn = getByRole("button");
    fireEvent.click(btn); // open → 1
    fireEvent.click(btn); // close → still 1
    fireEvent.click(btn); // reopen → still 1 (not re-counted)
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("respects defaultOpen: starts expanded with children mounted", () => {
    const { getByRole, getByText } = render(
      <ExploreZone defaultOpen>
        <div>DEEP_CONTENT</div>
      </ExploreZone>,
    );
    expect(getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(getByText("DEEP_CONTENT")).toBeTruthy();
  });

  // The containing-block hazard (globals.css): a held transform makes the wrapper a containing
  // block for position:fixed descendants (CompareLineup's overlay, the share bottom-sheet). The
  // disclosure must NOT animate the wrapper with transform/filter/will-change.
  it("does not put transform/filter/will-change on the wrapper (fixed-overlay containing-block safety)", () => {
    const { getByRole } = render(
      <ExploreZone defaultOpen>
        <div>X</div>
      </ExploreZone>,
    );
    const panel = getByRole("region");
    const wrapper = panel.parentElement as HTMLElement;
    const cls = `${wrapper.className} ${panel.className}`;
    expect(cls).not.toMatch(/transform|will-change|\bfilter\b|scale-|translate-/);
  });
});
