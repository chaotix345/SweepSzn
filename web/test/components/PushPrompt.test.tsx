// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { PushState } from "@/lib/usePush";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ state: "default" as PushState, subscribe: vi.fn() }));
vi.mock("@/lib/usePush", () => ({ usePush: () => ({ state: h.state, subscribe: h.subscribe }) }));

import PushPrompt from "@/components/PushPrompt";

describe("PushPrompt — context-aware copy", () => {
  it("default (challenge) context offers the friend-responds opt-in", () => {
    h.state = "default";
    const { container } = render(<PushPrompt />);
    expect(container.textContent).toMatch(/friend responds/i);
    expect(container.textContent).not.toMatch(/streak/i);
  });

  it("streak context offers the streak-reminder opt-in (Daily re-engagement)", () => {
    h.state = "default";
    const { container } = render(<PushPrompt context="streak" />);
    expect(container.textContent).toMatch(/streak/i);
  });

  it("renders nothing when push is unsupported", () => {
    h.state = "unsupported";
    const { container } = render(<PushPrompt context="streak" />);
    expect(container.innerHTML).toBe("");
  });
});
