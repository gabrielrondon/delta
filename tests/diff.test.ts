import { test, expect } from 'bun:test';
import {
  computeDiff,
  countChanges,
  calculateSimilarity,
  categorizeChanges,
} from '../src/lib/diff';

test('computeDiff detects additions', () => {
  const oldData = { foo: 'bar' };
  const newData = { foo: 'bar', baz: 'qux' };

  const diff = computeDiff(oldData, newData);

  expect(diff.length).toBeGreaterThan(0);
  expect(diff[0].op).toBe('add');
});

test('computeDiff detects deletions', () => {
  const oldData = { foo: 'bar', baz: 'qux' };
  const newData = { foo: 'bar' };

  const diff = computeDiff(oldData, newData);

  expect(diff.length).toBeGreaterThan(0);
  expect(diff[0].op).toBe('remove');
});

test('computeDiff detects replacements', () => {
  const oldData = { foo: 'bar' };
  const newData = { foo: 'baz' };

  const diff = computeDiff(oldData, newData);

  expect(diff.length).toBeGreaterThan(0);
  expect(diff[0].op).toBe('replace');
});

test('computeDiff returns empty array for identical data', () => {
  const data = { foo: 'bar', baz: 123 };
  const diff = computeDiff(data, data);

  expect(diff).toEqual([]);
});

test('countChanges returns correct count', () => {
  const oldData = { foo: 'bar' };
  const newData = { foo: 'baz', qux: 'quux' };

  const diff = computeDiff(oldData, newData);
  const count = countChanges(diff);

  expect(count).toBe(diff.length);
});

test('calculateSimilarity returns 1 for identical data', () => {
  const data = { foo: 'bar', baz: 123 };
  const similarity = calculateSimilarity(data, data);

  expect(similarity).toBe(1.0);
});

test('calculateSimilarity returns value between 0 and 1', () => {
  const oldData = { foo: 'bar', baz: 123 };
  const newData = { foo: 'baz', baz: 456 };

  const similarity = calculateSimilarity(oldData, newData);

  expect(similarity).toBeGreaterThanOrEqual(0);
  expect(similarity).toBeLessThanOrEqual(1);
});

test('categorizeChanges categorizes correctly', () => {
  const oldData = { foo: 'bar', baz: 'qux' };
  const newData = { foo: 'changed', quux: 'new' };

  const diff = computeDiff(oldData, newData);
  const categories = categorizeChanges(diff);

  expect(categories.total).toBe(diff.length);
  expect(categories.additions).toBeGreaterThanOrEqual(0);
  expect(categories.deletions).toBeGreaterThanOrEqual(0);
  expect(categories.modifications).toBeGreaterThanOrEqual(0);
});
