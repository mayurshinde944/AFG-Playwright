# AFG Automation - Testing Strategy

## 1. Testing Objective

Validate approximately 850 websites while keeping production server impact low.

The strategy separates lightweight infrastructure checks from browser-heavy UI checks.

## 2. Test Categories

### Infrastructure
- DNS
- SSL
- HTTP

### Browser/UI
- UI
- Responsive
- Cross-browser
- Visual

## 3. Daily Strategy

Daily browser-focused execution:

```text
Select 10–15 websites
        |
DNS
        |
SSL
        |
HTTP
        |
Critical failure?
  Yes -> stop site
  No  -> Playwright
        |
UI
        |
Responsive
        |
Cross-browser
```

Visual testing is not part of the default daily execution.
It is available as a separate configurable/manual capability and is not included in the DAILY_QA preset.

## 4. Periodic Full Infrastructure Strategy

For all active websites:

```text
850 websites
   |
controlled concurrency
   |
DNS + SSL + HTTP
```

Default infrastructure concurrency:
5

This must be monitored and configurable.

## 5. Specific Website Strategy

For a manually selected site:

- allow selected validators
- allow custom browsers
- allow custom viewports
- allow custom crawl limits
- allow custom retry configuration

High-load overrides require explicit confirmation.

## 6. Page Discovery Strategy

Default for full crawler (future phase):
- same domain only
- maximum 20 pages
- important pages first
- normalize/deduplicate
- exclude non-page resources
- skip authenticated pages

For UI Page Sampling (Current):
- discover links from homepage only
- maximum 10 pages per website
- select up to 3 priority/common pages
- randomly select remaining internal pages
- reuse single browser context

## 7. UI Test Strategy

UI validation evaluates up to 10 sampled pages sequentially to ensure site health without excessive crawling.

Phase 5B Lightweight Health Checks include:
- **Navigation/Timeouts**: Caught natively via Playwright (Severity: FAIL).
- **Blank Pages**: Checked via DOM evaluation of body text and image counts (Severity: FAIL).
- **Server Errors**: Checked for visible "Fatal error" text in DOM (Severity: FAIL).
- **Broken Images**: Checked via native DOM `img.complete` and `img.naturalWidth === 0`, ignoring lazy-loaded/data URLs (Severity: WARNING).
- **Same-Domain Resource Failures**: Filtering Playwright `requestfailed` events (Severity: WARNING).
- **JavaScript Errors**: Deduplicating `console` and `pageerror` events (Severity: WARNING).

Component validations (Header/Logo/Footer) are deferred to Phase 5C to decouple the framework from specific CMS templates.

Phase 5D/5E introduces Master UI Baseline Capture and Structural Comparison:
- A local JSON baseline captures a structural signature of expected global components (e.g. Header, Footer).
- Normal QA never visits the Master to generate baselines. Baselines are explicitly generated via `npm run baseline -- --url <master-url>`.
- **Phase 5E**: Normal QA loads this baseline once and compares clone structures inside the existing Playwright evaluation flow.
  - If Master has a component and the clone lacks it entirely: `master_component_missing` (WARNING).
  - To prevent false positives, we ignore exact selector matches, tag names, and child counts. Extra clone components are ignored.

Do not assert volatile content unless explicitly required.

## 8. Responsive Strategy

Default:
- mobile
- tablet
- desktop

Validate:
- overflow
- overlap
- visibility
- sizing
- basic interactions

## 9. Cross-Browser Strategy

Browser list is configurable.

Default candidate set:
- Chromium
- Firefox
- WebKit

Use the same discovered pages across browsers unless a browser-specific limit is configured.

Classify failures as:
- browser-specific
- common

## 10. SSL Strategy

Follow redirect chain and validate final URL certificate.

V1:
- expired = FAIL
- not expired = PASS

Record expiry and certificate metadata.

## 11. DNS Strategy

Validate:
- resolution
- CNAME
- SmartOnline relationship

Classify:
- PASS
- WARNING/REVIEW
- FAIL

## 12. HTTP Strategy

Default:
- connection failure = FAIL
- 4xx = FAIL
- 5xx = FAIL

Response-time thresholds are configurable.

## 13. Retry Strategy

Default max retries = 2.

Global ExecutionEngine retry:
- used for lightweight infrastructure checks (DNS, SSL, HTTP) and hard framework crashes.
- uses fresh browser/context where applicable.
- preserves same test conditions.

UI Page-Level Retry (Phase 5F-1):
- Transient navigation timeouts inside the UI validator are retried locally on the specific failing page.
- Successfully crawled pages are never repeated, massively reducing server load and duplicate requests.
- Deterministic UI failures (blank page, fatal error) are not retried.

Avoid infinite retries.

## 14. Evidence Strategy

Default screenshot:
- failure-only

Failure evidence may include:
- error
- URL
- browser
- viewport
- timestamp
- screenshot
- console/network error

## 15. Test Data / Inventory

Inventory is the source of truth for:
- URL
- active/inactive
- website identity
- domain type
- rotation metadata

Do not infer official active/inactive status from runtime failures.

## 16. Regression Strategy

Core framework tests should exist for:
- configuration resolution
- inventory loading
- scope selection
- rotation
- safety policy
- validator registration
- retry logic
- result aggregation

Validator-specific tests are added when each validator is implemented.

## 17. Safety Testing

Explicitly test dangerous combinations.

Examples:
- all + UI -> blocked
- all + responsive -> blocked
- all + cross-browser -> blocked
- all + visual -> blocked
- all + SSL -> allowed
- all + DNS -> allowed
- all + HTTP -> allowed

Test high-load manual override confirmation.

## 18. Preview Testing

Preview mode must:
- resolve the correct sites
- resolve validators
- show concurrency
- show browser/page counts
- show safety status
- execute zero external website tests

## 19. Failure Testing

Test:
- DNS failure
- SSL expiry
- HTTP 4xx
- HTTP 5xx
- page load failure
- console error
- responsive overflow
- browser-specific failure
- common browser failure
- retry behavior

## 20. Server Load Validation

Before increasing concurrency:
1. Run controlled tests in a safe environment where possible.
2. Start with defaults.
3. Monitor server behavior.
4. Increase only with evidence.
5. Keep browser concurrency conservative.

The framework must never optimize purely for execution speed.

## 21. Definition of Done for a Validator

A validator is ready when:
- it follows the validator contract
- it has unit/integration tests as appropriate
- it handles expected failures
- it produces normalized results
- it respects timeouts
- it respects retry policy
- it respects cancellation/stop behavior
- it does not bypass rate limiting
- it does not embed reporting logic
