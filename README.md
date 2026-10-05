# AFG Automation

## Website QA Automation Platform

AFG Automation is a configurable QA automation platform for approximately 850 websites.

The project is designed to automate recurring website quality checks while minimizing production server load.

## Main Goals

- Automate SSL validation
- Automate DNS/CNAME validation
- Automate HTTP/availability checks
- Automate front-end UI testing
- Automate responsive testing
- Automate cross-browser testing
- Capture evidence for failures
- Generate Excel, HTML and email reports
- Integrate with Jenkins
- Add AI-assisted analysis in a later phase

## Core Operating Model

### Daily

Test approximately 10–15 websites selected using coverage-based rotation.

Daily browser checks may include:
- UI
- responsive
- cross-browser

Daily infrastructure checks:
- DNS
- SSL
- HTTP

### Periodic

Run lightweight infrastructure checks across all approximately 850 websites using controlled concurrency.

### Manual

Allow:
- one specific URL
- multiple URLs
- inventory-selected websites
- custom validator combinations
- custom browser/viewport/crawler configuration
- explicit Master UI baseline generation (`npm run baseline -- --url <master-url>`)

## Technology

- Node.js
- JavaScript
- Playwright
- Excel/CSV initially
- Jenkins
- HTML reporting
- Excel reporting
- Email reporting
- AI in a future phase

## Critical Constraint

Production server load protection is mandatory.

Lightweight checks may cover all sites with controlled concurrency.

Browser-based checks are targeted and must not automatically run across all 850 sites.

## Current Status

Requirements and V1 architecture are defined.

V1 is the complete first production version, implemented incrementally through Phases 1–10 in `docs/ROADMAP.md`.

Current implementation target:
**Sprint 1 - Foundation (Phase 1)**

See:
- `AGENTS.md`
- `docs/REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/TESTING_STRATEGY.md`
- `docs/ROADMAP.md`
