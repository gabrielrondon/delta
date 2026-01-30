import { test, expect } from 'bun:test';
import { checkJsonSize, getJsonSize } from '../src/lib/validation';

test('checkJsonSize returns true for small data', () => {
  const data = { foo: 'bar' };
  const result = checkJsonSize(data, 10);

  expect(result).toBe(true);
});

test('checkJsonSize returns false for large data', () => {
  // Create ~2MB of data
  const largeData = {
    data: new Array(100000).fill({ foo: 'bar', baz: 'qux', num: 12345 }),
  };

  const result = checkJsonSize(largeData, 1); // Max 1MB

  expect(result).toBe(false);
});

test('getJsonSize returns correct size', () => {
  const data = { foo: 'bar' };
  const size = getJsonSize(data);

  expect(size).toBeGreaterThan(0);
  expect(size).toBe(JSON.stringify(data).length);
});

test('getJsonSize handles empty object', () => {
  const data = {};
  const size = getJsonSize(data);

  expect(size).toBe(2); // "{}"
});
