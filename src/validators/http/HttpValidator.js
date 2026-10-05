'use strict';

const http = require('http');
const https = require('https');
const { ValidationResult, STATUS } = require('../../models/ValidationResult');
const { performance } = require('perf_hooks');

class HttpValidator {
  /**
   * Validate a website's HTTP availability.
   *
   * @param {import('../../models/Website')} website 
   * @param {object} context 
   * @param {object} context.config
   * @returns {Promise<ValidationResult>}
   */
  async validate(website, context) {
    const config = context.config;
    const timeoutMs = config.http?.timeoutMs || 10000;
    const maxRedirects = config.http?.maxRedirects || 5;

    let originalUrl = website.url;
    let finalUrl = originalUrl;
    let statusCode = null;
    let duration = 0;

    const startTime = performance.now();

    try {
      const result = await this._fetchWithRedirects(originalUrl, maxRedirects, timeoutMs);
      finalUrl = result.finalUrl;
      statusCode = result.statusCode;
      duration = Math.round(performance.now() - startTime);

      return this._evaluateResponse(website.id, statusCode, originalUrl, finalUrl, duration);
    } catch (err) {
      duration = Math.round(performance.now() - startTime);
      return this._buildResult(website.id, STATUS.FAIL, `HTTP validation failed: ${err.message}`, {
        originalUrl,
        finalUrl
      }, duration, err);
    }
  }

  /**
   * Issues a GET request and follows redirects up to maxRedirects.
   * Resolves with { finalUrl, statusCode } or rejects on timeout/error.
   */
  _fetchWithRedirects(initialUrl, maxRedirects, timeoutMs) {
    return new Promise((resolve, reject) => {
      let activeRequest = null;
      let timeoutId = null;
      let redirectsCount = 0;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const abortRequest = () => {
        if (activeRequest) {
          activeRequest.destroy();
          activeRequest = null;
        }
      };

      timeoutId = setTimeout(() => {
        abortRequest();
        reject(new Error('HTTP validation timeout'));
      }, timeoutMs);

      const performRequest = (currentUrlStr) => {
        let currentUrl;
        try {
          currentUrl = new URL(currentUrlStr);
        } catch (e) {
          cleanup();
          return reject(new Error(`Invalid URL: ${currentUrlStr}`));
        }

        const isHttps = currentUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
          method: 'GET'
        };

        activeRequest = client.request(currentUrl, options, (res) => {
          // Immediately discard the body
          res.on('data', () => {});

          const statusCode = res.statusCode;
          const isRedirect = [301, 302, 303, 307, 308].includes(statusCode);

          if (isRedirect && res.headers.location) {
            if (redirectsCount >= maxRedirects) {
              abortRequest();
              cleanup();
              return reject(new Error('Exceeded maximum redirects limit'));
            }
            redirectsCount++;
            
            let nextUrl;
            try {
               nextUrl = new URL(res.headers.location, currentUrlStr).toString();
            } catch (err) {
               abortRequest();
               cleanup();
               return reject(new Error(`Invalid redirect location: ${res.headers.location}`));
            }
            abortRequest(); // We don't need to consume the body of a redirect
            return performRequest(nextUrl);
          }

          // Not a redirect (or no location header), so this is the final response.
          // Cleanly destroy to avoid waiting for a large body to download
          res.destroy();

          cleanup();
          resolve({ finalUrl: currentUrlStr, statusCode });
        });

        activeRequest.on('error', (err) => {
          cleanup();
          reject(err);
        });

        activeRequest.end();
      };

      performRequest(initialUrl);
    });
  }

  /**
   * Evaluates the final HTTP status code.
   */
  _evaluateResponse(websiteId, statusCode, originalUrl, finalUrl, duration) {
    const details = {
      originalUrl,
      finalUrl,
      statusCode
    };

    if (statusCode >= 200 && statusCode < 300) {
      return this._buildResult(websiteId, STATUS.PASS, `Successful response (${statusCode})`, details, duration);
    }
    
    // We treat 3xx that somehow didn't redirect as a FAIL (or if location header was missing).
    if (statusCode >= 300 && statusCode < 400) {
       return this._buildResult(websiteId, STATUS.FAIL, `Unresolved redirect (${statusCode})`, details, duration);
    }

    if (statusCode >= 400 && statusCode < 500) {
      return this._buildResult(websiteId, STATUS.FAIL, `Client error (${statusCode})`, details, duration);
    }

    if (statusCode >= 500) {
      return this._buildResult(websiteId, STATUS.FAIL, `Server error (${statusCode})`, details, duration);
    }

    // Any other odd status code
    return this._buildResult(websiteId, STATUS.FAIL, `Unexpected status code (${statusCode})`, details, duration);
  }

  _buildResult(websiteId, status, message, details = {}, duration = 0, evidenceError = null) {
    const evidence = evidenceError ? { 
      error: evidenceError.message || evidenceError,
      stack: evidenceError.stack 
    } : {};

    return new ValidationResult({
      websiteId,
      validatorName: 'http',
      status,
      message,
      details,
      duration,
      evidence
    });
  }
}

module.exports = HttpValidator;
