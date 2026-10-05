/**
 * Logger
 *
 * Winston-based configurable logger with component context support.
 *
 * See: AGENTS.md §29 (coding discipline — reporting)
 */

'use strict';

const winston = require('winston');

let _defaultLogger = null;

/**
 * Create a new Winston logger instance.
 *
 * @param {object} [config]
 * @param {string} [config.level='info'] - Log level
 * @param {string|null} [config.file=null] - Optional log file path
 * @returns {winston.Logger}
 */
function createLogger(config = {}) {
  const level = config.level || 'info';

  const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
      const comp = component ? `[${component}] ` : '';
      const metaKeys = Object.keys(meta).filter(k => k !== 'splat');
      const metaStr = metaKeys.length > 0
        ? ` ${JSON.stringify(Object.fromEntries(metaKeys.map(k => [k, meta[k]])))}`
        : '';
      return `${timestamp} ${level}: ${comp}${message}${metaStr}`;
    })
  );

  const transports = [
    new winston.transports.Console({ format: consoleFormat }),
  ];

  if (config.file) {
    transports.push(
      new winston.transports.File({
        filename: config.file,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );
  }

  return winston.createLogger({ level, transports });
}

/**
 * Get or create the shared default logger.
 *
 * @param {object} [config] - Configuration (used only on first call)
 * @returns {winston.Logger}
 */
function getLogger(config) {
  if (!_defaultLogger) {
    _defaultLogger = createLogger(config);
  }
  return _defaultLogger;
}

/**
 * Reset the shared default logger (primarily for testing).
 */
function resetLogger() {
  _defaultLogger = null;
}

module.exports = { createLogger, getLogger, resetLogger };
