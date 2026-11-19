// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Button } from "~/components/ui/button";
it("keeps navigation links semantic and keyboard reachable", () => {
  render(
    createElement(
      Button,
      { asChild: true },
      createElement("a", { href: "/accessibility" }, "Accessibility"),
    ),
  );
  expect(
    screen.getByRole("link", { name: "Accessibility" }).getAttribute("href"),
  ).toBe("/accessibility");
});
it("does not activate disabled controls", () => {
  const onClick = vi.fn();
  render(
    createElement(Button, { disabled: true, onClick }, "Create tournament"),
  );
  screen.getByRole("button", { name: "Create tournament" }).click();
  expect(onClick).not.toHaveBeenCalled();
});
