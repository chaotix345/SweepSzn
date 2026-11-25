// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import EngineReceipts from "@/components/EngineReceipts";
import { STRESS_PANEL } from "@/lib/stressPanel";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

const coeff = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "coefficients.json"), "utf-8"));
const famous = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "famous_teams.json"), "utf-8"));

describe("EngineReceipts — public accuracy receipts", () => {
  it("shows both out-of-sample numbers straight from coefficients.json _meta", () => {
    const { container } = render(<EngineReceipts />);
    expect(container.textContent).toContain(coeff._meta.cv_wins_rmse.toFixed(1));
    expect(container.textContent).toContain(coeff._meta.track_b_cv.toFixed(1));
  });

  it("lists every stress-panel lineup and every famous team", () => {
    render(<EngineReceipts />);
    for (const l of STRESS_PANEL) expect(screen.getByText(l.publicName)).toBeTruthy();
    for (const t of famous) expect(screen.getByText(t.label)).toBeTruthy();
  });

  it("has top-10 player and defender lists and labels fitted vs reasoned", () => {
    const { container } = render(<EngineReceipts />);
    expect(screen.getByText("Top 10 players")).toBeTruthy();
    expect(screen.getByText("Top 10 defenders")).toBeTruthy();
    expect(container.textContent).toMatch(/Fitted to real NBA teams/);
    expect(container.textContent).toMatch(/Reasoned, not fitted/);
    expect(container.textContent).not.toMatch(/not hand-tuned/);
    expect(container.querySelector("#receipts")).toBeTruthy();
  });
});
