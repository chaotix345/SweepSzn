// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: React.forwardRef<HTMLAnchorElement, { href: string; children: React.ReactNode; className?: string }>(
    function MockLink({ href, children, className, ...rest }, ref) { return React.createElement("a", { href, className, ref, ...rest }, children); },
  ),
}));
vi.mock("@/components/NotificationBell", () => ({ default: () => null }));

import SiteHeader from "@/components/SiteHeader";

afterEach(cleanup);

const cta = () => screen.getAllByRole("link").find((l) => l.textContent?.startsWith("Draft your five"))!;

describe("SiteHeader", () => {
  it("hides the header CTA on mobile (hidden is not overridden by the Button's inline-flex)", () => {
    pathname = "/leaderboards";
    render(<SiteHeader />);
    const cls = cta().className.split(" ");
    expect(cls).toContain("hidden");
    expect(cls).toContain("sm:inline-flex");
    expect(cls).not.toContain("inline-flex");
  });

  it("is the orange primary off the home page but steps down to secondary on /, where the hero leads", () => {
    pathname = "/about";
    render(<SiteHeader />);
    expect(cta().className).toContain("bg-orange-500");
    cleanup();
    pathname = "/";
    render(<SiteHeader />);
    expect(cta().className).not.toContain("bg-orange-500");
    expect(cta().className).toContain("border-zinc-700");
    expect(cta().getAttribute("href")).toBe("/play");
  });

  it("links Teams and Stats in the desktop nav, and Dex + About in the mobile menu", () => {
    pathname = "/about";
    render(<SiteHeader />);
    const hrefs = () => screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs()).toEqual(expect.arrayContaining(["/teams", "/stats"]));
    fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
    const menu = document.getElementById("mobile-nav")!;
    const menuHrefs = [...menu.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(menuHrefs).toEqual(expect.arrayContaining(["/play", "/leaderboards", "/teams", "/stats", "/dex", "/how-it-works", "/about"]));
  });
});
