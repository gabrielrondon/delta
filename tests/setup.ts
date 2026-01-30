// Test setup file
// This file runs before all tests

import { beforeAll, afterAll } from 'bun:test';

beforeAll(() => {
  console.log('Setting up test environment...');
});

afterAll(() => {
  console.log('Cleaning up test environment...');
});
