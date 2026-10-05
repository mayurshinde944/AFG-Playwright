# AFG Automation - Architecture Decisions

## ADR-001 - Single Framework

Decision:
Use one website QA framework with independent validators.

Reason:
Avoid separate disconnected tools and allow common execution, safety, configuration and reporting.

## ADR-002 - Targeted Browser Testing

Decision:
Do not run browser-heavy tests against all 850 websites by default.

Reason:
Production server load is a hard constraint.

## ADR-003 - Lightweight Full-Site Testing

Decision:
DNS, SSL and HTTP may run across all 850 websites using controlled concurrency.

Reason:
These checks are lightweight compared with browser execution.

## ADR-004 - Daily Rotation

Decision:
Daily browser testing normally targets 10–15 websites using coverage-based rotation.

Reason:
Avoid unnecessary load while maintaining long-term site coverage.

## ADR-005 - Rotation Strategy

Decision:
Prioritize never-tested and longest-unchecked websites, then randomize among similar candidates.

Reason:
Pure randomness can repeatedly select the same sites.

## ADR-006 - Inventory Authority

Decision:
Active/inactive status comes from the inventory/source.

Reason:
A failed website test does not necessarily mean the website is officially deactivated.

## ADR-007 - Inactive Sites

Decision:
Inactive sites are excluded from automatic runs but may be manually tested.

Reason:
Preserve flexibility for investigation.

## ADR-008 - New Sites

Decision:
New active websites immediately enter rotation.

Reason:
They have no test history and should naturally receive early coverage.

## ADR-009 - SSL Final URL

Decision:
Validate the final redirected URL's certificate.

Reason:
The customer-facing final domain is the meaningful SSL target.

## ADR-010 - SSL Failure Definition

Decision:
Only an expired certificate is a failure in V1.

Reason:
Avoid turning future expiry into a failure until a business rule requires it.

## ADR-011 - DNS Unusual Relationship

Decision:
Unusual but resolving DNS configurations are WARNING/REVIEW, not automatic failure.

Reason:
Custom domains can have legitimate DNS architectures.

## ADR-012 - Infrastructure Concurrency

Decision:
Default DNS/SSL/HTTP concurrency is 5 and configurable.

Reason:
Controlled parallelism reduces execution time without creating a large request burst.

## ADR-013 - Browser Concurrency

Decision:
Default browser workers = 1.

Reason:
Browser execution is heavier and production safety is more important than speed.

## ADR-014 - Fail Fast

Decision:
Critical infrastructure failure stops further testing for that website.

Reason:
Avoid unnecessary browser traffic against a website that cannot be meaningfully tested.

## ADR-015 - Retry

Decision:
Default max retries = 2.

Reason:
Transient failures should be retried, but retries must remain bounded.

## ADR-016 - Fresh Retry Context

Decision:
Retries use a fresh browser/context while preserving test conditions.

Reason:
Avoid state contamination from the previous attempt.

## ADR-017 - Same-Domain Crawler

Decision:
Crawler stays within the same domain.

Reason:
Prevent unintended crawling of external sites.

## ADR-018 - URL Normalization

Decision:
Normalize and deduplicate URLs.

Reason:
Avoid testing the same logical page multiple times.

## ADR-019 - Crawler Limit

Decision:
Default max pages per website = 20.

Reason:
Balance useful coverage and production safety.

## ADR-020 - Important Page Priority

Decision:
Prioritize homepage, navigation and prominent pages before remaining discovered pages.

Reason:
Limited crawl capacity should cover high-value pages first.

## ADR-021 - Authentication

Decision:
Skip authenticated pages by default.

Reason:
V1 focuses on public-facing website QA and avoids credential complexity.

## ADR-022 - Broken Links

Decision:
Broken-link testing is on hold.

Reason:
Keep V1 focused; architecture remains extensible.

## ADR-023 - Screenshot Default

Decision:
Failure-only screenshots are the default.

Reason:
Reduce artifact storage while preserving evidence for failures.

## ADR-024 - History Retention

Decision:
V1 history retention = 30 days.

Reason:
Enough for rotation, recent trend analysis and troubleshooting without unnecessary storage complexity.

## ADR-025 - Configuration Hierarchy

Decision:
Defaults -> config file -> CLI -> Jenkins parameters.

Reason:
Provide predictable configuration with flexible operational overrides.

## ADR-026 - Preview Mode

Decision:
Preview/dry-run is a standard safety feature.

Reason:
Users must be able to inspect scope and load characteristics before execution.

## ADR-027 - High-Load Override

Decision:
High-load manual overrides require explicit confirmation.

Reason:
Prevent accidental production load.

## ADR-028 - Reporting

Decision:
Produce Excel + interactive HTML + email summary.

Reason:
Excel supports detailed QA records, HTML supports investigation, email supports operational awareness.

## ADR-029 - Immediate Critical Alerts

Decision:
Critical failures may trigger immediate notifications.

Reason:
Some infrastructure failures should not wait for the end of a long run.

## ADR-030 - AI Timing

Decision:
AI is introduced after deterministic automation is stable.

Reason:
AI should enhance trustworthy results rather than compensate for unreliable automation.

## ADR-031 - AI Data Minimization

Decision:
Send minimal/sanitized evidence to AI by default.

Reason:
Reduce unnecessary data exposure and AI cost.

## ADR-032 - AI Authority

Decision:
AI cannot automatically override deterministic test results.

Reason:
AI output is advisory.

## ADR-033 - Database

Decision:
Do not introduce a database in V1.

Reason:
Excel/CSV is sufficient for the current inventory size and complexity. The architecture remains database-ready.

## ADR-034 - Technology

Decision:
Use Node.js, JavaScript and Playwright.

Reason:
Matches the team's automation direction and supports the required browser testing capabilities.

## ADR-035 - Visual Testing Not in Daily Default

Decision:
Visual testing is not part of the default daily QA execution or the DAILY_QA preset.

Reason:
Visual testing is a separate capability intended for configurable or manual use. The default daily chain is DNS, SSL, HTTP, UI, Responsive and Cross-browser.

## ADR-036 - V1 Definition

Decision:
V1 is the complete first production version, implemented incrementally through Phases 1–10.
Phase 1 (Foundation) is the current Sprint 1.
AI (Phase 11) and the future backlog items are outside V1.

Reason:
Clarify the boundary between V1 incremental delivery and future work.
