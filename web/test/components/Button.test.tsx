// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className, ...rest }, children),
}));

import { Button, ButtonLink } from "@/components/ui/Button";

describe("Button", () => {
  it("renders a <button> with the primary + md defaults and a focus ring", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("bg-orange-500");
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("focus-visible:ring-orange-500");
  });

  it("applies the secondary variant and sm size", () => {
    render(<Button variant="secondary" size="sm">X</Button>);
    const btn = screen.getByRole("button", { name: "X" });
    expect(btn.className).toContain("border-zinc-700");
    expect(btn.className).not.toContain("bg-orange-500");
    expect(btn.className).toContain("min-h-9");
  });

  it("forwards disabled + merges custom className", () => {
    render(<Button disabled className="custom-x">D</Button>);
    const btn = screen.getByRole("button", { name: "D" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain("disabled:opacity-60");
    expect(btn.className).toContain("custom-x");
  });

  it("ButtonLink renders an anchor to href with primary styling", () => {
    render(<ButtonLink href="/play">Play</ButtonLink>);
    const link = screen.getByRole("link", { name: "Play" });
    expect(link.getAttribute("href")).toBe("/play");
    expect(link.className).toContain("bg-orange-500");
  });
});
