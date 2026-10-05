'use strict';

const https = require('https');
const http = require('http');
const { ValidationResult, STATUS } = require('../../models/ValidationResult');
const tls = require('tls');

class SslValidator {
  /**
   * Validate a website's SSL/TLS certificate.
   *
   * @param {import('../../models/Website')} website 
   * @param {object} context 
   * @param {object} context.config
   * @returns {Promise<ValidationResult>}
   */
  async validate(website, context) {
    const config = context.config;
    const timeoutMs = config.ssl?.timeoutMs || 10000;
    const maxRedirects = config.ssl?.maxRedirects || 5;

    let originalUrl = website.url;
    let finalUrl = originalUrl;
    let certData = null;

    try {
      const result = await this._followRedirectsWithTimeout(originalUrl, maxRedirects, timeoutMs);
      finalUrl = result.finalUrl;
      certData = result.cert;
      
      const { status, message, errorDetails } = this._evaluateCertificate(certData, finalUrl, result.authError);
      
      let normalizedCert = null;
      if (certData && Object.keys(certData).length > 0) {
        let daysRemaining = null;
        if (certData.valid_to) {
          const toTime = new Date(certData.valid_to).getTime();
          daysRemaining = Math.ceil((toTime - Date.now()) / (1000 * 60 * 60 * 24));
        }
        
        normalizedCert = {
          subject: certData.subject ? (certData.subject.CN || certData.subject) : null,
          issuer: certData.issuer ? (certData.issuer.O || certData.issuer.CN || certData.issuer) : null,
          validFrom: certData.valid_from,
          validTo: certData.valid_to,
          daysRemaining
        };
      }

      return this._buildResult(website.id, status, message, {
        originalUrl,
        finalUrl,
        certificateNormalized: normalizedCert,
        certificateRaw: certData
      }, errorDetails);

    } catch (err) {
      // Handles connection failures, max redirects, timeout, etc.
      return this._buildResult(website.id, STATUS.FAIL, err.message, { originalUrl, finalUrl }, err);
    }
  }

  /**
   * Issues a GET request and follows redirects up to maxRedirects.
   * Resolves with { finalUrl, cert, authError } or rejects on timeout/error.
   */
  _followRedirectsWithTimeout(initialUrl, maxRedirects, timeoutMs) {
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
        reject(new Error('SSL validation timeout'));
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
          method: 'GET',
          // Allow connection to complete even if cert is invalid so we can inspect it
          rejectUnauthorized: false,
          agent: false
        };

        activeRequest = client.request(currentUrl, options, (res) => {
          // Immediately consume/discard data so the response stream ends cleanly
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
            
            // Resolve relative locations
            let nextUrl;
            try {
               nextUrl = new URL(res.headers.location, currentUrlStr).toString();
            } catch (err) {
               abortRequest();
               cleanup();
               return reject(new Error(`Invalid redirect location: ${res.headers.location}`));
            }
            abortRequest(); // abort current request since we don't need its body
            return performRequest(nextUrl);
          }

          // Arrived at final destination
          let cert = null;
          let authError = null;

          if (isHttps && res.socket) {
            cert = res.socket.getPeerCertificate(true);
            authError = res.socket.authorizationError;
          }

          cleanup();
          resolve({ finalUrl: currentUrlStr, cert, authError });
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
   * Evaluate the extracted certificate.
   */
  _evaluateCertificate(cert, finalUrl, authError) {
    if (!cert || Object.keys(cert).length === 0) {
      return { 
        status: STATUS.FAIL, 
        message: 'No certificate found or not an HTTPS destination', 
        errorDetails: { message: 'Missing certificate' } 
      };
    }

    // Check expiry
    let isExpired = false;
    if (cert.valid_to) {
      const validToDate = new Date(cert.valid_to);
      if (validToDate < new Date()) {
        isExpired = true;
      }
    }

    // Check hostname mismatch manually using Node's tls function
    let hostname;
    try {
      hostname = new URL(finalUrl).hostname;
    } catch (e) {
      hostname = finalUrl;
    }
    
    // tls.checkServerIdentity returns undefined if valid, or an Error object if mismatch
    const identityError = tls.checkServerIdentity(hostname, cert);
    const isHostnameMismatch = !!identityError;

    if (isExpired) {
      return { 
        status: STATUS.FAIL, 
        message: 'Certificate is expired',
        errorDetails: { message: 'Expired certificate', authError, valid_to: cert.valid_to }
      };
    }

    if (isHostnameMismatch) {
      return { 
        status: STATUS.FAIL, 
        message: `Hostname mismatch: certificate is not valid for ${hostname}`,
        errorDetails: { message: identityError.message, authError }
      };
    }

    // If there is another authorization error (e.g. self-signed, untrusted root) we fail it in V1 as well
    if (authError) {
      return {
        status: STATUS.FAIL,
        message: `Certificate authorization error: ${authError}`,
        errorDetails: { message: authError }
      };
    }

    return { status: STATUS.PASS, message: 'Valid certificate' };
  }

  _buildResult(websiteId, status, message, details = {}, evidenceError = null) {
    const evidence = evidenceError ? { 
      error: evidenceError.message || evidenceError,
      stack: evidenceError.stack 
    } : {};

    return new ValidationResult({
      websiteId,
      validatorName: 'ssl',
      status,
      message,
      details,
      evidence
    });
  }
}

module.exports = SslValidator;
