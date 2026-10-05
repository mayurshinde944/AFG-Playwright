# AFG Automation - Architecture

## 1. Architecture Goal

Create a scalable, maintainable and production-safe website QA automation framework.

The architecture must allow validators to be added independently without changing the execution engine.

## 2. High-Level Flow

```text
Inventory
   |
Scope Resolver
   |
Execution Planner
   |
Safety Policy
   |
Rate Limiter
   |
Execution Engine
   |
Validators
   |
Result Aggregator
   |
Reporting
```

## 3. Core Components

### Inventory Provider

Provides website records.

Initial providers:
- CSV
- Excel

Future:
- Database

### Scope Resolver

Resolves:
- random/rotation
- specific
- all

### Execution Planner

Converts an ExecutionRequest into an executable ExecutionPlan.

It resolves:
- websites
- validators
- browsers
- viewports
- crawl limits
- concurrency
- retries
- screenshots
- timeouts

### Safety Policy

Determines whether the execution plan is safe.

### Rate Limiter

Controls request/test concurrency.

### Execution Engine

Executes the validated plan.

### Validator Registry

Registers and resolves validators dynamically.

### Result Aggregator

Collects normalized ValidationResult objects.

### Reporting

Consumes aggregated results and produces:
- Excel
- HTML
- email

## 4. Data Flow

```text
User/Jenkins
    |
ExecutionRequest
    |
Scope Resolver
    |
Execution Planner
    |
ExecutionPlan
    |
Safety Policy
    |
Rate Limiter
    |
Execution Engine
    |
ValidationResult
    |
Result Aggregator
    |
Reports
```

## 5. Website Model

```text
Website
- id
- name
- url
- active
- domainType
- lastTestedAt
- lastStatus
```

Website model contains website metadata, not validator results.

## 6. ExecutionRequest

Represents what the user/Jenkins requested.

Example:

```js
{
  scope: {
    type: "random",
    count: 15
  },
  preset: "DAILY_QA",
  mode: "execute"
}
```

It may optionally contain:
- validators
- browsers
- viewports
- crawl settings
- execution overrides
- retry settings
- screenshot settings

It must not contain the final resolved website list or calculated execution plan.

## 7. ExecutionPlan

Represents what will actually execute.

Example:

```text
Scope: random
Websites: 15 resolved sites
Validators: DNS, SSL, HTTP, UI, Responsive, Browser
Browsers: Chromium, Firefox, WebKit
Viewports: Mobile, Tablet, Desktop
Max pages: 20
Browser workers: 1
Infrastructure concurrency: 5
Retries: 2
Screenshots: failure-only
```

## 8. ValidationResult Model

Contract: `validate(website, context) -> Promise<ValidationResult>`

Statuses:
- PASS: Fully passed.
- WARNING: Health check warnings generated, but the page is fundamentally usable.
- FAIL: Validation explicitly failed (e.g., timeout, blank page).
- SKIP: Conditions not met.
- ERROR: System/framework error.

For UI validation specifically:
- Subpages are checked sequentially.
- If a subpage fails with a transient error (e.g. navigation timeout), it is retried independently without reloading previous successful pages (Page-Level Retry).
- If any page returns FAIL after all local retries, the overall result is FAIL.
- If no pages FAIL, but any returns WARNING, the overall result is WARNING.
- Otherwise, PASS.

## 9. Validator Types

Lightweight:
- DNS
- SSL
- HTTP

Heavy:
- UI (multi-page sampling)
- Responsive
- Cross-browser
- Visual

## 10. Master UI Baseline Capture and Comparison (Phase 5D & 5E)

To prepare for structural validation, we capture a Master UI Baseline:
- **BaselineManager**: Generates and safely stores the baseline JSON artifact containing a lightweight structural signature (exists, selector, tagName, childCount) for global components (Header, Logo, Navigation, Footer).
- **Generation**: Explicit CLI operation (`npm run baseline -- --url <master-url>`) that visits the Master template once.
- **Comparison**: Normal QA execution loads the local baseline once at startup and evaluates clone structural integrity inside the existing Phase 5A Playwright session (Phase 5E). Clone validation gracefully avoids strict DOM path checks to suppress false positives and strictly executes without Master website network load.

## 11. Crawler / Sampler Architecture

Crawler/Sampler responsibilities:
- discover pages (from homepage only for UI sampling)
- normalize URLs
- deduplicate
- enforce domain boundary
- apply exclusions
- prioritize important pages
- enforce page limit (e.g. 10 pages for UI validation)

Crawler/Sampler does not decide which validators run.

The Execution Planner decides what should be tested, while individual validators (like UI) use the Sampler to fetch target URLs.

## 11. Playwright Architecture

Playwright should be isolated behind browser/page execution components.

The browser layer should support:
- configurable browsers
- configurable viewports
- fresh context for retries
- screenshot capture
- console/page error capture

## 12. Configuration Architecture

Resolution order:

```text
Defaults
  -> Config File
  -> CLI
  -> Jenkins
  -> Final Config
```

Configuration should be validated before execution.

## 13. Safety Architecture

Safety checks happen before execution.

Example:

```text
ExecutionRequest
  |
ExecutionPlan
  |
SafetyPolicy
  |
Allowed / Blocked
  |
Execution
```

Safety policy must know validator classifications and scope.

## 14. Reporting Architecture

Validators produce normalized results.

The Result Aggregator does not know how Excel or HTML works.

Reporting adapters consume aggregated results independently.

## 15. Storage Architecture

V1:
- inventory in Excel/CSV
- results stored for 30 days
- artifacts stored according to retention policy

Future:
- database
- object storage
- historical analytics

## 16. AI Architecture

AI should consume selected normalized evidence from the Result Aggregator.

AI should not directly control validators or bypass deterministic rules.

Future flow:

```text
Validation Results
    |
Evidence Sanitizer
    |
AI Analyzer
    |
AI Insight
    |
Report/Review
```

## 17. Recommended Project Structure

```text
website-qa/
|
├── config/
├── inventory/
├── src/
|   ├── core/
|   ├── models/
|   ├── validators/
|   ├── crawler/
|   ├── browser/
|   ├── reporting/
|   ├── logging/
|   └── utils/
|
├── tests/
├── reports/
├── artifacts/
├── docs/
├── AGENTS.md
├── README.md
└── package.json
```

## 18. Dependency Direction

Prefer:

```text
Core
  ^
Models
  ^
Validators / Adapters
  ^
Reporting / Infrastructure
```

Avoid validators importing reporting or inventory implementation details directly.

## 19. Key Principle

The Execution Engine should not know the internal implementation of DNS, SSL, HTTP or Playwright validators.

It should work through validator contracts and normalized results.
