# AFG Automation - Requirements

## 1. Business Requirements

### BR-01
The system shall support approximately 850 websites.

### BR-02
The system shall automate front-end/UI, SSL, DNS, responsive and cross-browser testing.

### BR-03
The system shall minimize production server load.

### BR-04
The system shall support daily testing of approximately 10–15 websites.

### BR-05
The system shall support periodic testing of all websites for lightweight infrastructure checks.

### BR-06
The system shall support manual testing of one or multiple specified websites.

### BR-07
The system shall support both SmartOnline domains and custom domains.

### BR-08
The system shall support inventory updates from the existing process and manual changes.

## 2. Execution Scope Requirements

### FR-01 Random/Rotation
The system shall support selecting a configurable number of websites using coverage-based rotation.

### FR-02 Specific
The system shall support one or multiple specific websites.

### FR-03 All
The system shall support all active websites for lightweight validators.

### FR-04 Manual Input
Specific websites shall be selectable by:
- URL
- file
- inventory selection

### FR-05 Rotation
The system shall track last test information and prioritize never-tested/oldest-tested websites.

## 3. Validator Requirements

### FR-06 DNS
The system shall support DNS resolution, CNAME inspection and SmartOnline relationship checks.

### FR-07 SSL
The system shall follow redirects and validate the final URL certificate.

### FR-08 SSL Failure
Expired certificate shall be a failure in V1.

### FR-09 HTTP
The system shall support connection and HTTP status validation.

### FR-10 UI
The system shall validate standard website components and configurable UI health checks.

### FR-11 Responsive
The system shall test configurable viewports and basic responsive interactions.

### FR-12 Cross-browser
The system shall support configurable browsers.

### FR-13 Visual
The system shall support configurable screenshot capture and future visual comparison.

### FR-14 Broken Links
Broken-link testing is intentionally out of V1 scope.

## 4. Crawler Requirements

### FR-15
The crawler shall remain within the same domain.

### FR-16
The crawler shall normalize and deduplicate URLs.

### FR-17
The crawler shall support configurable exclusions.

### FR-18
The crawler shall skip authenticated pages by default.

### FR-19
Default maximum pages per website shall be 20.

### FR-20
The crawler shall prioritize important pages.

## 5. Safety Requirements

### FR-21
The system shall have a Safety Policy.

### FR-22
All-site lightweight scans shall be allowed by default.

### FR-23
All-site browser scans shall be blocked by default.

### FR-24
High-load manual overrides shall require explicit confirmation.

### FR-25
Browser worker default shall be 1.

### FR-26
Infrastructure concurrency default shall be 5.

### FR-27
The system shall support preview/dry-run mode.

## 6. Failure and Retry Requirements

### FR-28
Retries shall be configurable.

### FR-29
Default max retries shall be 2.

### FR-30
Retries shall use fresh browser/context while preserving test conditions.

### FR-31
Critical infrastructure failures shall stop further testing for that website.

### FR-32
Non-critical failures shall allow remaining applicable checks to continue.

## 7. Reporting Requirements

### FR-33
Generate Excel reports.

### FR-34
Generate interactive HTML reports.

### FR-35
Send end-of-run email summaries.

### FR-36
Send immediate notifications for critical failures.

### FR-37
Store relevant failure evidence.

## 8. History Requirements

### FR-38
Maintain test history for 30 days in V1.

### FR-39
Maintain last-tested information for rotation.

### FR-40
Preserve execution configuration for failed runs.

## 9. Configuration Requirements

### FR-41
Support configuration files.

### FR-42
Support CLI overrides.

### FR-43
Support Jenkins parameters.

### FR-44
Support presets.

### FR-45
Support direct validator configuration.

## 10. Inventory Requirements

### FR-46
Initial inventory shall support Excel/CSV.

### FR-47
Active/inactive status shall come from the inventory.

### FR-48
Inactive websites shall be excluded from automatic runs.

### FR-49
New active websites shall immediately enter rotation.

### FR-50
Inactive website history shall follow normal retention.

## 11. AI Future Requirements

### FR-51
AI shall analyze failures in a future phase.

### FR-52
AI shall analyze visual differences in a future phase.

### FR-53
AI shall support intelligent summaries and issue clustering in a future phase.

### FR-54
AI evidence shall be minimal/sanitized by default.

### FR-55
AI shall not automatically override deterministic test results.
