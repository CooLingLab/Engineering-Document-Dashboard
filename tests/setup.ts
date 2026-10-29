import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

if (!globalThis.ResizeObserver) {
  class TestResizeObserver implements ResizeObserver {
    constructor(_callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: TestResizeObserver, configurable: true });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
