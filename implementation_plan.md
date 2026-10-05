# Phase 8: Cross-Browser Testing

Provide cross-browser testing using Playwright to validate the structural and visual integrity of the websites across Chromium, Firefox, and WebKit. It will classify identified issues as either common (affecting all engines) or browser-specific.

## Why it is the next logical phase
Phases 1–5 established the UI automation foundation (Chromium-based), Phase 6 established the reporting infrastructure, and Phase 7 introduced viewport variance (Responsive). Phase 8 naturally extends the variance testing dimension to browser engines (Chromium, Firefox, WebKit), fulfilling the roadmap requirement. It relies directly on the refactored, robust `PageChecker` and `PageNavigator` completed in earlier phases.

## Current-State Analysis
- **Execution Model**: `browserWorkers = 1` forces strict sequential testing. `PageSampler` robustly samples pages up to a configured maximum.
- **Reporting Model**: `ExcelReportWriter` natively supports explicit columns mapping properties like viewport. It will require a minor extension to support a dedicated `Browser` column.
- **Validator Ecosystem**: We have `UiValidator` (Chromium UI), and `ResponsiveValidator` (Chromium UI across viewports). `CrossBrowserValidator` will be a new heavy validator.

## Exact Scope
1. Implement `CrossBrowserValidator.js` which registers as a `heavy` validator.
2. Utilize `config.browsers` (`['chromium', 'firefox', 'webkit']`) to execute Playwright sequentially across all engines.
3. Keep the existing maximum of 10 sampled pages. Cross-browser will run up to 10 pages × 3 browsers = 30 browser/page validations per website.
4. Reuse `PageChecker.js` as the underlying validation engine for each browser to ensure consistency in what is tested (headers, footers, console errors, etc.) without duplicating checking/navigation logic. `CrossBrowserValidator` will control which Playwright engine is launched and passed to the checker.
5. **Execution Records**: `CrossBrowserValidator` will not collapse `res.pages` into unique URLs. Each page/browser combination will retain its own explicit execution record including `browser` metadata, `status`, `duration`, `retryAttempts`, and specific `issues`.
6. **Issue Classification and Grouping**:
   - Compare issues across browsers using a deterministic structured identity (issue type + relevant structured context). Do not rely solely on `type:message`.
   - **Common Failure**: If a deterministically identical issue is present in all configured browsers.
   - **Browser-Specific Failure**: If a deterministically identical issue is present in only a subset of configured browsers.
7. **Excel Reporting**: Extend `ExcelReportWriter.js` minimally to support browser metadata. Add structured browser information to the `Pages` sheet and affected-browser information to the `Issues` sheet without redesigning the core workbook structure.

## Proposed Architecture
- **`src/validators/crossbrowser/CrossBrowserValidator.js`**: Orchestrates discovery (using Chromium), iteration over URLs, and iteration over `config.browsers`. 
- **Issue Grouping & Classification logic**: A helper function within the validator to aggregate issues from all browser engines for a single URL and identify structural commonality.
- **Reused Components**: 
  - `PageSampler` (for 10-page maximum).
  - `PageChecker` (for the actual DOM evaluation logic).
  - `PageNavigator` (implicitly used by `PageChecker` for safe navigation).

## Files to Create / Modify
### New Files
- `src/validators/crossbrowser/CrossBrowserValidator.js`
- `tests/unit/validators/crossbrowser/CrossBrowserValidator.test.js`
- `tests/integration/crossbrowser.test.js`

### Modified Files
- `src/validators/index.js` (Register `cross-browser`)
- `src/reporting/writers/ExcelReportWriter.js` (Add `Browser` metadata mapping to Pages and Issues sheets)
- `tests/unit/reporting/ExcelReportWriter.test.js` (Verify the new `Browser` mapping behaves safely)

## Server-Load Impact, Safety & Concurrency
- **Concurrency**: `browserWorkers = 1` remains strictly enforced. The validator will launch one browser engine at a time, test the URL, close it, and move to the next.
- **Safety Rules**: All existing `SafetyPolicy` and `RateLimiter` rules remain unchanged. `CrossBrowserValidator` is a `heavy` validator and must remain blocked against the `all` scope without explicit `forceOverride`.
- **Master Website**: No requests will be made to the Master website. Baseline structural comparison is explicitly out of scope for Phase 8.

## Testing Strategy
- **Unit Tests**: Verify the deterministic issue grouping algorithm successfully matches structural context across engine types and properly classifies Common vs Browser-Specific failures. Verify browser-specific page records are correctly retained inside `res.pages`.
- **Integration Tests**: Execute `CrossBrowserValidator` on a local mock server and verify it successfully launches Firefox and WebKit engines correctly alongside Chromium.
- **Reporting Tests**: Verify `ExcelReportWriter.test.js` asserts the new `Browser` columns are populated successfully for Cross-browser validations, and cleanly ignored for non-cross-browser validators.

## Controlled Live Verification Strategy
Execute a controlled run against exactly one test website: `node src/cli/qa.js --scope specific --websites dns-001 --validator cross-browser --report`.
Verify the generated Excel file logs issues with exact browser attribution in both the `Pages` and `Issues` sheets.

## Explicitly What Phase 8 Will NOT Change
- Will NOT alter existing DNS, SSL, HTTP, UI, or Responsive validators.
- Will NOT alter the `browserWorkers = 1` concurrency paradigm.
- Will NOT bypass any `SafetyPolicy` or `RateLimiter` controls.
- Will NOT introduce visual pixel-matching (Visual Testing is Phase 9).
- Will NOT contact the Master website.
- Will NOT introduce `crossBrowser.maxPages`; it adheres to the global bounds.

## User Review Required
None. All architectural decisions have been finalized.

## Open Questions
None.
