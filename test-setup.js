import '@testing-library/jest-dom'

// FIX (UX-06 CI): JSDOM defines window but does not implement window.matchMedia.
// Any component that calls window.matchMedia() (e.g. TaxReturn's isMobile effect)
// throws TypeError in JSDOM tests. This mock provides the minimal matchMedia
// interface needed.
//
// The typeof window guard is required because setupFiles runs for ALL test
// environments — including the four pure-unit test files that run under
// environment: 'node' (vitest.config.js default). Node has no window at all,
// so a bare Object.defineProperty(window, ...) throws ReferenceError: window
// is not defined. The guard makes this a no-op in Node and active in JSDOM.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
