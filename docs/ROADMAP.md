# AFG Automation - Roadmap

## Phase 0 - Requirements and Architecture

Status: COMPLETE

Completed:
- business requirements
- execution modes
- server-load rules
- inventory rules
- crawler rules
- SSL/DNS behavior
- UI/responsive/browser strategy
- reporting strategy
- AI direction
- architecture decisions

## V1 Definition

V1 is the complete first production version, implemented incrementally through Phases 1–10.

Phase 1 (Foundation) is the current Sprint 1.

AI (Phase 11) and the future backlog items listed below are outside V1.

## Phase 1 - Foundation

Status: NEXT

Build:
1. Node.js project
2. Folder structure
3. Configuration manager
4. Inventory provider interface
5. CSV/Excel inventory loader
6. Website model
7. ExecutionRequest
8. Scope Resolver
9. Execution Planner
10. Safety Policy
11. Rate Limiter
12. Validator Registry
13. ValidationResult
14. Result Aggregator
15. Logger
16. Preview/dry-run mode
17. Unit tests for core components

Expected milestone:

```text
Request
  |
Scope resolution
  |
Execution plan
  |
Safety validation
  |
Preview
```

No real website validators yet.

## Phase 2 - DNS

Implement:
- DNS resolution
- CNAME lookup
- SmartOnline relationship logic
- PASS/WARNING/FAIL classification
- controlled concurrency
- retries
- tests
- reporting integration

## Phase 3 - SSL

Implement:
- redirect following
- redirect chain recording
- final URL certificate inspection
- expiry detection
- certificate metadata
- retries
- tests
- reporting integration

## Phase 4 - HTTP

Implement:
- connection checks
- status checks
- redirect handling
- configurable timeout
- configurable response-time rule
- retries
- tests

## Phase 5 - Playwright UI

Implement:
- browser manager
- page manager
- common UI validators (Phase 5C)
- console/page error collection (Phase 5B)
- image checks (Phase 5B)
- layout checks
- screenshots
- crawler integration
- [x] Phase 5D: Master UI Baseline Capture (Create local reference signature)
- [x] Phase 5E: Master vs Clone UI Structural Comparison (Compare against local baseline)

Default:
- 20 pages
- same domain
- failure-only screenshots

## Phase 6 - Responsive

Implement:
- configurable viewports
- overflow detection
- overlap detection
- visibility checks
- sizing checks
- basic interactions
- evidence capture

## Phase 7 - Cross-Browser

Implement:
- configurable browser matrix
- Chromium
- Firefox
- WebKit
- browser-specific limits
- failure classification
- common failure grouping

## Phase 8 - Visual

Implement:
- baseline management
- screenshot comparison
- configurable thresholds
- review workflow
- visual evidence

## Phase 9 - Reporting

Implement:
- Excel report
- interactive HTML dashboard
- email summary
- critical alerts
- report attachments
- 30-day retention/cleanup

## Phase 10 - Jenkins

Implement:
- scheduled jobs
- manual jobs
- parameterized jobs
- specific website execution
- selected validators
- selected browsers/viewports
- artifact publishing

## Phase 11 - AI

### AI Phase 1
Failure analysis.

### AI Phase 2
Visual difference analysis.

### AI Phase 3
Reporting intelligence:
- summaries
- issue clustering
- prioritization
- trends

AI remains advisory and cannot override deterministic results.

## Future Backlog

Not part of V1:
- broken-link testing
- authenticated crawling
- advanced performance testing
- Lighthouse integration
- security scanning
- database migration
- long-term analytics
- advanced AI agents

## Guiding Principle

Implement the smallest useful capability at each phase.

Do not start a later phase until the previous phase is stable, tested and integrated.
