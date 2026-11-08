import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
Object.defineProperty(window, "ResizeObserver", {
  value: class {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback([
        { target, contentRect: { width: 800, height: 300 } } as ResizeObserverEntry,
      ], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  },
});
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn(() => "blob:csv"),
  writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: vi.fn(),
  writable: true,
});
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn((query: string) => ({ media: query, matches: false, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) });
Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });
