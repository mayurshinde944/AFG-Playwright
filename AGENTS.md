# AFG Automation - AI Agent Instructions

## 1. Project Overview

This project is a Website QA Automation Platform designed to automate quality checks for approximately 850 websites.

Primary testing areas:
- DNS
- SSL
- HTTP / availability
- Front-end UI
- Responsive testing
- Cross-browser testing
- Visual validation
- Reporting
- Jenkins execution
- AI-assisted analysis (future phase)

The websites follow a common standardized structure/template.

## 2. Primary Business Constraint

### Production server load protection is critical

The automation must never unnecessarily generate load against the production server.

Lightweight validators:
- DNS
- SSL
- HTTP

These may be executed against all approximately 850 websites using controlled concurrency.

Heavy/browser validators:
- UI
- Responsive
- Cross-browser
- Visual

These must not automatically execute against all 850 websites.

Normally they run against:
- 10–15 rotation-selected websites
- explicitly selected websites
- priority/failed websites when supported

Never bypass server-load protection without explicit approval.

## 3. Architecture Principles

Follow:
- Clean Architecture
- SOLID principles
- Separation of concerns
- Configuration-driven design
- Validator/plugin-based architecture
- Low coupling
- High cohesion
- Reusable components
- Testable components
- Explicit interfaces/contracts
- Fail-fast behavior where appropriate
- Safe production execution

Do not introduce architectural shortcuts simply to make implementation faster.

## 4. Do Not Hard-Code Website-Specific Logic

Do not create separate automation implementations for each website.

Use generic validators and inventory/configuration data.

Website-specific behavior should only exist when explicitly represented through configuration.

## 5. Execution Model

Supported scopes:
- random / rotation
- specific
- all

Random/rotation is normally used for daily UI testing.

Specific supports one or multiple manually selected websites.

All is primarily intended for lightweight validators such as DNS, SSL and HTTP.

Never automatically run heavy browser validators against all websites.

## 6. Website Rotation Rules

Default selection strategy:
1. Never-tested websites
2. Websites not tested for the longest time
3. Avoid recently tested websites
4. Randomize among similarly eligible candidates

The behavior must be configurable.

## 7. Inventory Rules

Initial inventory:
- Excel/CSV

The architecture must allow a future database-backed inventory.

Minimum website information:
- website ID/name
- website URL
- active/inactive
- domain type
- last tested timestamp
- last status

The inventory is authoritative for active/inactive status.

The automation must not automatically mark a website inactive merely because a test fails.

New active websites immediately enter rotation.

Inactive websites are excluded from automatic runs but may be explicitly tested manually.

## 8. Domain Rules

Websites may use SmartOnline domains or custom/owner domains.

A custom domain may still resolve through SmartOnline infrastructure.

Never assume custom domain means external infrastructure.

## 9. SSL Rules

SSL validation must:
1. Start from the supplied URL
2. Follow redirects
3. Record the redirect chain
4. Identify the final URL
5. Validate the final URL's certificate

V1 SSL failure:
- expired certificate = FAIL

Upcoming expiration is not a failure in V1.

Collect useful certificate information where available.

## 10. DNS Rules

DNS validation is configurable.

Default capabilities:
- DNS resolution
- CNAME inspection
- SmartOnline infrastructure relationship

Results:
- PASS: expected/recognized relationship
- WARNING/REVIEW: resolves but relationship is unusual/unverified
- FAIL: DNS resolution failure

Do not create false failures for legitimate custom-domain configurations.

## 11. HTTP Rules

HTTP is optional and part of the default infrastructure preset.

Default failures:
- connection failure
- HTTP 4xx
- HTTP 5xx

Response-time thresholds are configurable and are not failures by default in V1.

Record redirects.

## 12. Execution Order

For daily testing:

DNS -> SSL -> HTTP -> critical failure check -> Playwright -> UI -> Responsive -> Cross-browser

Visual testing is not part of the default daily execution.
It is available as a configurable/manual capability and is not included in the DAILY_QA preset.

If a critical infrastructure failure makes browser testing meaningless:
- stop that website
- record the failure
- continue with the next website

## 13. Retry Rules

Default:
- maxRetries = 2

Retries use a fresh browser/context where applicable, while keeping the same:
- URL
- validator
- browser
- viewport
- configuration

## 14. Concurrency

Default:
- browserWorkers = 1
- infrastructureConcurrency = 5

Both are configurable.

Never increase concurrency merely for speed.

## 15. Safety Policy

The Safety Policy must validate execution plans before execution.

Examples:
- ALL + SSL -> allowed
- ALL + DNS -> allowed
- ALL + HTTP -> allowed
- ALL + UI -> blocked by default
- ALL + Responsive -> blocked by default
- ALL + Cross-browser -> blocked by default
- ALL + Visual -> blocked by default

High-load manual overrides require explicit confirmation.

## 16. Dry-Run / Preview

Preview mode:
- resolves scope
- selects websites
- resolves validators
- resolves browsers
- resolves viewports
- calculates concurrency
- applies safety policy
- displays the execution plan

Preview must not execute tests.

## 17. Page Discovery

Crawler rules:
- same domain only
- normalize URLs
- deduplicate
- configurable exclusions
- skip authenticated pages by default
- prioritize important pages
- default maxPages = 20
- full crawl requires explicit request

Important page priority:
1. Homepage
2. Main navigation pages
3. Prominent homepage links
4. Important/common template pages
5. Remaining pages

## 18. UI Testing

Use one generic reusable UI suite because websites share a common structure.

Default checks:
- header
- logo
- navigation
- main content
- footer
- image loading
- console errors
- page errors
- basic visibility
- basic overflow
- screenshots according to configuration

Broken-link testing is ON HOLD and must not be implemented unless explicitly requested.

## 19. Responsive Testing

Default viewports:
- Mobile: 390x844
- Tablet: 768x1024
- Desktop: 1366x768

Checks:
- horizontal overflow
- overlap
- visibility
- text/image sizing
- basic interactions such as menus, buttons, links and applicable forms

Viewports remain configurable.

## 20. Cross-Browser Testing

Browser list is configurable.

Possible browsers:
- Chromium
- Firefox
- WebKit

Same discovered pages are tested across selected browsers by default.

Browser-specific page limits may be configured.

Classify:
- browser-specific failures
- common failures

Group common failures where possible.

## 21. Screenshots and Evidence

Default screenshot mode:
- failure-only

Supported:
- off
- failure-only
- always

Relevant failure evidence may include:
- error
- URL
- timestamp
- validator
- browser
- viewport
- screenshot
- console/network errors

## 22. Reporting

Generate:
- Excel detailed report
- interactive HTML report
- email summary

Always send an end-of-run summary.

Critical failures may trigger immediate alerts.

## 23. History

V1 retention:
- 30 days

Inactive website history follows the same retention.

Architecture should allow longer retention later.

## 24. Configuration Hierarchy

Default configuration
-> configuration file
-> CLI overrides
-> Jenkins parameters
-> final execution configuration

Do not hard-code configurable values into validators.

## 25. Jenkins

Support:
- scheduled runs
- manual runs
- parameterized runs
- specific website runs
- selected validators
- selected browsers
- selected viewports
- selected scope

Jenkins orchestrates the framework; it does not contain test logic.

## 26. AI

AI is a future phase.

Do not add AI before deterministic automation is reliable.

Future phases:
1. failure analysis
2. visual change analysis
3. intelligent reporting/trend analysis/issue clustering

AI must not override deterministic results automatically.

Default AI data policy:
- minimal/sanitized evidence
- relevant error
- URL/domain
- browser
- viewport
- relevant DOM snippet
- screenshot only when needed

## 27. Development Order

1. Foundation
2. DNS
3. SSL
4. HTTP
5. Playwright UI
6. Responsive
7. Cross-browser
8. Visual
9. Reporting
10. Jenkins
11. AI

## 28. V1 and Current Sprint

V1 is the complete first production version, implemented incrementally through Phases 1–10 in ROADMAP.md.

AI (Phase 11) and the future backlog items are outside V1.

Sprint 1 corresponds to Phase 1 (Foundation) and includes only:
- project initialization
- configuration manager
- inventory loader
- Website model
- ExecutionRequest
- Scope Resolver
- Execution Planner
- Safety Policy
- Rate Limiter
- Validator Registry
- ValidationResult
- Result Aggregator
- Logger
- Dry-run/Preview

Do not implement DNS, SSL, HTTP, Playwright UI, Responsive, Cross-browser, Visual or AI yet.

## 29. Coding Discipline

When implementing:
1. Inspect existing code.
2. Read relevant documentation.
3. Explain planned changes.
4. Make the smallest appropriate change.
5. Run relevant tests.
6. Report changes and test results.
7. Mention remaining risks.

Do not modify unrelated files.

## 30. Final Priority

When uncertain, prioritize:
1. Production/server safety
2. Correctness
3. Maintainability
4. Testability
5. Simplicity
6. Execution speed

Never sacrifice production safety or architecture quality merely to make implementation faster.
