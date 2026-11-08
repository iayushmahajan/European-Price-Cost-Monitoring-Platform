import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useResource } from "./resource";
it("aborts obsolete transport and rejects out-of-order results", async () => {
  const resolves: ((value: string) => void)[] = [];
  const signals: AbortSignal[] = [];
  const load = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<string>((resolve) => resolves.push(resolve));
  });
  function Probe({ id }: { id: string }) {
    const r = useResource(id, load);
    return <div>{r.loading ? "Loading" : r.data}</div>;
  }
  const view = render(<Probe id="DE" />);
  view.rerender(<Probe id="FR" />);
  expect(signals[0].aborted).toBe(true);
  await act(async () => resolves[1]("France"));
  expect(screen.getByText("France")).toBeInTheDocument();
  await act(async () => resolves[0]("Germany"));
  expect(screen.queryByText("Germany")).not.toBeInTheDocument();
  view.unmount();
  expect(signals[1].aborted).toBe(true);
});
