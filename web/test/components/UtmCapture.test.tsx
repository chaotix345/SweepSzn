// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import UtmCapture from "@/components/UtmCapture";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/?utm_source=x_launch&ref=rabc123def45");
});

// Mounted in the root layout — must first-touch BOTH attribution channels (utm + referral) so a
// /?utm_source=&ref= landing that then navigates to a clean /play still attributes the first_play.
describe("UtmCapture", () => {
  it("first-touches the utm source and the inbound referral code on mount", () => {
    render(<UtmCapture />);
    expect(localStorage.getItem("szn:utm:source")).toBe("x_launch");
    expect(localStorage.getItem("szn:ref:in")).toBe("rabc123def45");
  });

  it("first-touch wins: a later mount with a different ?ref=/utm does not overwrite", () => {
    render(<UtmCapture />); // captures the beforeEach URL (x_launch / rabc123def45)
    window.history.replaceState(null, "", "/?utm_source=reddit&ref=rfff000aaa11");
    render(<UtmCapture />); // a second arrival must not clobber the first-touch values
    expect(localStorage.getItem("szn:utm:source")).toBe("x_launch");
    expect(localStorage.getItem("szn:ref:in")).toBe("rabc123def45");
  });
});
