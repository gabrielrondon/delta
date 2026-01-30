import { test, expect } from 'bun:test';
import { hashData, generateApiKey, hashApiKey, getKeyPreview } from '../src/lib/hash';

test('hashData generates consistent hash for same data', () => {
  const data = { foo: 'bar', baz: 123 };
  const hash1 = hashData(data);
  const hash2 = hashData(data);

  expect(hash1).toBe(hash2);
  expect(hash1).toHaveLength(64); // SHA256 produces 64 hex chars
});

test('hashData generates different hash for different data', () => {
  const data1 = { foo: 'bar' };
  const data2 = { foo: 'baz' };

  const hash1 = hashData(data1);
  const hash2 = hashData(data2);

  expect(hash1).not.toBe(hash2);
});

test('hashData normalizes object keys', () => {
  const data1 = { a: 1, b: 2 };
  const data2 = { b: 2, a: 1 }; // Different order

  const hash1 = hashData(data1);
  const hash2 = hashData(data2);

  expect(hash1).toBe(hash2); // Should be same hash
});

test('generateApiKey creates valid API key', () => {
  const apiKey = generateApiKey('dk_proj');

  expect(apiKey).toStartWith('dk_proj_');
  expect(apiKey.length).toBeGreaterThan(20);
});

test('hashApiKey generates consistent hash', () => {
  const apiKey = 'dk_proj_test123';
  const hash1 = hashApiKey(apiKey);
  const hash2 = hashApiKey(apiKey);

  expect(hash1).toBe(hash2);
  expect(hash1).toHaveLength(64);
});

test('getKeyPreview returns correct preview', () => {
  const apiKey = 'dk_proj_1234567890abcdef';
  const preview = getKeyPreview(apiKey);

  expect(preview).toBe('dk_proj_...cdef');
});
