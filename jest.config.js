/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/cli/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary'],
};
