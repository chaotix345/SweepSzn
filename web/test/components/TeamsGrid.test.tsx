// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import TeamsGrid, { type TeamCard } from "@/components/TeamsGrid";

const teams: TeamCard[] = [
  { team: "ATL", name: "Atlanta Hawks", path: "/teams/atl", record: { wins: 50, losses: 32, grade: "B" }, names: ["Dominique Wilkins"] },
  { team: "BOS", name: "Boston Celtics", path: "/teams/bos", record: { wins: 70, losses: 12, grade: "A+" }, names: ["Larry Bird"] },
  { team: "CHA", name: "Charlotte Hornets", path: "/teams/cha", record: null, names: [] },
];
const order = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));

afterEach(() => cleanup());

describe("TeamsGrid (F21)", () => {
  it("starts A–Z and sorts by projected wins on demand", () => {
    render(<TeamsGrid teams={teams} />);
    expect(order()).toEqual(["/teams/atl", "/teams/bos", "/teams/cha"]);
    fireEvent.click(screen.getByRole("button", { name: "By wins" }));
    expect(order()).toEqual(["/teams/bos", "/teams/atl", "/teams/cha"]);
  });

  it("filters by franchise or player name", () => {
    render(<TeamsGrid teams={teams} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bird" } });
    expect(order()).toEqual(["/teams/bos"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/No franchise matches/)).toBeTruthy();
  });
});
