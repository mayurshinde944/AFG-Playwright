/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  maxWorkers: 1,
  testTimeout: 60000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/cli/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary'],
};
