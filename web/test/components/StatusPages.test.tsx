// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({ usePathname: () => "/r/bogus" }));
vi.mock("next/link", () => ({
  default: React.forwardRef<HTMLAnchorElement, { href: string; children: React.ReactNode; className?: string }>(
    function MockLink({ href, children, className, ...rest }, ref) { return React.createElement("a", { href, className, ref, ...rest }, children); },
  ),
}));
vi.mock("@/components/NotificationBell", () => ({ default: () => null }));

import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";

afterEach(cleanup);

describe("app/not-found", () => {
  it("renders a 404 heading, the orange play CTA and a way home inside the site chrome", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/404.*Airball/);
    const play = screen.getAllByRole("link").find((l) => l.textContent === "Draft your five →" && l.closest("main"));
    expect(play?.getAttribute("href")).toBe("/play");
    expect(play?.className).toContain("bg-orange-500");
    const home = screen.getAllByRole("link").find((l) => l.textContent === "Home");
    expect(home?.getAttribute("href")).toBe("/");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(document.getElementById("main-content")).toBeTruthy();
  });
});

describe("app/error", () => {
  it("offers Retry (calls Next's retry) and a link home", () => {
    const retry = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorPage error={Object.assign(new Error("boom"), { digest: "abc123" })} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText(/abc123/)).toBeTruthy();
    expect(screen.getAllByRole("link").some((l) => l.textContent === "Home" && l.getAttribute("href") === "/")).toBe(true);
    spy.mockRestore();
  });
});
