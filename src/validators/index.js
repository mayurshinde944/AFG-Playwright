'use strict';

const DnsValidator = require('./dns/DnsValidator');
const SslValidator = require('./ssl/SslValidator');
const HttpValidator = require('./http/HttpValidator');
const UiValidator = require('./ui/UiValidator');
const ResponsiveValidator = require('./responsive/ResponsiveValidator');
const CrossBrowserValidator = require('./crossbrowser/CrossBrowserValidator');
const VisualValidator = require('./visual/VisualValidator');

/**
 * Register all built-in validators with the given registry.
 * 
 * @param {import('../core/ValidatorRegistry')} registry 
 */
function registerValidators(registry) {
  registry.register('dns', new DnsValidator(), { type: 'lightweight' });
  registry.register('ssl', new SslValidator(), { type: 'lightweight' });
  registry.register('http', new HttpValidator(), { type: 'lightweight' });
  registry.register('ui', new UiValidator(), { type: 'heavy' });
  registry.register('responsive', new ResponsiveValidator(), { type: 'heavy' });
  registry.register('cross-browser', new CrossBrowserValidator(), { type: 'heavy' });
  registry.register('visual', new VisualValidator(), { type: 'heavy' });
}

module.exports = { registerValidators };
