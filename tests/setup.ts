/**
 * Jest test setup file
 */

// Extend Jest timeout for cluster tests
jest.setTimeout(30000);

// Mock console methods for cleaner test output if needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

global.console = {
  ...console,
  // Suppress error logs during tests unless DEBUG is set
  error: process.env.DEBUG ? console.error : jest.fn(),
  warn: process.env.DEBUG ? console.warn : jest.fn(),
};

beforeEach(() => {
  // Reset console mocks if needed
});

afterEach(() => {
  // Cleanup after each test
});

// Global test utilities
(global as any).testUtils = {
  deepClone: <T>(obj: T): T => {
    if (typeof (globalThis as any).structuredClone === "function") {
      return (globalThis as any).structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  },

  isEqual: (a: any, b: any): boolean => {
    return JSON.stringify(a) === JSON.stringify(b);
  },

  colors: {
    green: (text: string): string => `\x1b[32m${text}\x1b[0m`,
    red: (text: string): string => `\x1b[31m${text}\x1b[0m`,
    yellow: (text: string): string => `\x1b[33m${text}\x1b[0m`,
    blue: (text: string): string => `\x1b[34m${text}\x1b[0m`,
    gray: (text: string): string => `\x1b[90m${text}\x1b[0m`,
  },
};
