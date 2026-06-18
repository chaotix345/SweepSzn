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
