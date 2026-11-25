// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Shell } from "@/components/game/Shell";

describe("Shell — change-mode escape hatch", () => {
  afterEach(() => cleanup());

  it("renders a Modes control that fires onModeSelect (keeps the picker reachable in-game)", () => {
    const onModeSelect = vi.fn();
    render(
      <Shell roundNum={1} mode="daily" onRestart={() => {}} onModeSelect={onModeSelect}>
        x
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /modes/i }));
    expect(onModeSelect).toHaveBeenCalledTimes(1);
  });

  it("omits the Modes control when onModeSelect is not provided", () => {
    render(
      <Shell roundNum={1} mode="daily" onRestart={() => {}}>
        x
      </Shell>,
    );
    expect(screen.queryByRole("button", { name: /modes/i })).toBeNull();
  });
});

describe("Shell — round pills (F10)", () => {
  afterEach(() => cleanup());

  it("pulses the current round while drafting", () => {
    const { container } = render(<Shell roundNum={5} mode="classic" onRestart={() => {}}>x</Shell>);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Round 5 of 5" })).toBeTruthy();
  });

  it("shows every pill solid once all five picks are in", () => {
    const { container } = render(<Shell roundNum={5} complete mode="classic" onRestart={() => {}}>x</Shell>);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(container.querySelectorAll(".bg-orange-500")).toHaveLength(5);
  });
});
