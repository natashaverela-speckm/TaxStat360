import '@testing-library/jest-dom'

// FIX (UX-06 CI): JSDOM defines window but does not implement window.matchMedia.
// Any component that calls window.matchMedia() (e.g. TaxReturn's isMobile effect)
// throws TypeError in tests, causing unrelated test suites to fail.
// This mock provides the minimal matchMedia interface needed for Vitest + JSDOM.
// Must be in setupFiles so it runs before any test file imports component code.
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
