# AFG Automation — CLI Commands Reference Guide

This document lists all available Command Line Interface (CLI) commands for the AFG Automation platform, organized strictly according to production safety rules.

---

## 🛡️ The Golden Rule: Production Server Load Protection

To protect the production server hosting ~850 websites from overload:

| Test Type | Validators | Can Run on ALL (~850) Sites? | Recommended Scope |
| :--- | :--- | :---: | :--- |
| **Lightweight** | DNS, SSL, HTTP | ✅ **YES (`--all`)** | All active websites in inventory |
| **Heavy Browser** | UI, Responsive, Cross-Browser, Visual | ❌ **NO (Blocked by Safety Policy)** | **Rotation (10–15 sites)** or **Specific (`--specific`)** |

---

## ⚡ Quick Cheatsheet

| Goal | Command |
| :--- | :--- |
| **Run Daily UI Rotation (10–15 sites from file)** | `npm run qa -- --validator ui` |
| **Run Daily Responsive Rotation (10–15 sites from file)** | `npm run qa -- --validator responsive` |
| **Run Daily Cross-Browser Rotation (10–15 sites from file)** | `npm run qa -- --validator cross-browser` |
| **Run ALL websites from file (Lightweight: DNS + SSL + HTTP)** | `npm run qa -- --all` |
| **Run ALL websites from file (SSL only)** | `npm run qa -- --all --validator ssl` |
| **Run 1 specific site from file (UI)** | `npm run qa -- --specific <websiteId> --validator ui` |
| **Watch 1 specific site UI live (visible browser)** | `npm run qa -- --specific <websiteId> --validator ui --headed` |
| **Test any direct URL (no file needed)** | `npm run qa -- --url https://your-site.com.au --validator ssl` |
| **Dry-run (preview rotation without executing)** | `npm run preview` |
| **Start Web Dashboard (Browser UI)** | `node src/api/server.js` |

---

## 🔄 1. Running Browser Tests from the File: Smart Rotation Mode

Because heavy browser tests (**UI, Responsive, Cross-Browser, Visual**) cannot run on all ~850 sites at once, the system uses **Coverage-Based Rotation** to test 10–15 sites daily.

### How Rotation Works:
1. Picks websites that have **never been tested** first.
2. Next picks websites **not tested for the longest time**.
3. Avoids recently tested websites.
4. Over a few weeks, all ~850 websites get 100% complete browser test coverage safely!

### Commands:
- **Run daily UI rotation (safe batch from file):**
  ```powershell
  npm run qa -- --validator ui
  ```
- **Run daily Responsive rotation (safe batch from file):**
  ```powershell
  npm run qa -- --validator responsive
  ```
- **Run daily Cross-Browser rotation (safe batch from file):**
  ```powershell
  npm run qa -- --validator cross-browser
  ```
- **Run daily Visual rotation (safe batch from file):**
  ```powershell
  npm run qa -- --validator visual
  ```
- **Run daily rotation with Excel report output:**
  ```powershell
  npm run qa -- --validator ui --report
  ```

---

## 🎯 2. Running a Specific Website from the File

When you want to test one specific website listed in `inventory/sample.csv`:

- **Run UI test on a specific website ID:**
  ```powershell
  npm run qa -- --specific dns-001 --validator ui
  ```
- **Run UI test visibly (watch the browser open):**
  ```powershell
  npm run qa -- --specific dns-001 --validator ui --headed
  ```
- **Run Responsive test on a specific website ID:**
  ```powershell
  npm run qa -- --specific dns-001 --validator responsive
  ```
- **Run Cross-Browser test on a specific website ID:**
  ```powershell
  npm run qa -- --specific dns-001 --validator cross-browser
  ```
- **Run Visual regression on a specific website ID:**
  ```powershell
  npm run qa -- --specific dns-001 --validator visual
  ```
- **Run all checks on a specific website ID:**
  ```powershell
  npm run qa -- --specific dns-001 --validator dns --validator ssl --validator http --validator ui
  ```

---

## 🌐 3. Running ALL Websites from the File (Lightweight Tests ONLY)

The `--all` flag is **strictly for lightweight tests** (DNS, SSL, HTTP). These do not launch browser instances and run safely with controlled concurrency (5 workers):

- **Run DNS + SSL + HTTP on ALL active websites in the file:**
  ```powershell
  npm run qa -- --all
  ```
- **Run SSL only on ALL websites in the file:**
  ```powershell
  npm run qa -- --all --validator ssl
  ```
- **Run DNS only on ALL websites in the file:**
  ```powershell
  npm run qa -- --all --validator dns
  ```
- **Run HTTP only on ALL websites in the file:**
  ```powershell
  npm run qa -- --all --validator http
  ```
- **Run lightweight checks on ALL websites and export Excel report:**
  ```powershell
  npm run qa -- --all --report
  ```

---

## 🚀 4. Ad-Hoc Testing (Direct URL — No File Editing Needed)

Quickly test any URL without touching `inventory/sample.csv`:

```powershell
# Quick SSL check
npm run qa -- --url https://accomplish.staging-smartonline.com.au --validator ssl

# Quick UI check (visible browser)
npm run qa -- --url https://accomplish.staging-smartonline.com.au --validator ui --headed

# Quick Responsive check
npm run qa -- --url https://accomplish.staging-smartonline.com.au --validator responsive

# Quick Cross-Browser check
npm run qa -- --url https://accomplish.staging-smartonline.com.au --validator cross-browser
```

---

## 🔍 5. Preview / Dry-Run (`npm run preview`)

Review the execution plan, selected websites, and safety rules **without executing any tests**:

```powershell
# Preview rotation batch
npm run preview

# Preview all lightweight checks
npm run preview -- --all --validator ssl

# Preview a specific website
npm run preview -- --specific dns-001 --validator ui
```

---

## ⚙️ 6. Master UI Baseline Generation (`npm run baseline`)

Updates `./config/baselines/master-ui-baseline.json` by inspecting the Master template homepage:

```powershell
npm run baseline -- --url https://masterv2.staging-smartonline.com.au/
```

---

## 🖥️ 7. Web Dashboard (Interactive Browser UI)

To use the visual browser interface:

```powershell
node src/api/server.js
```
Then visit `http://localhost:3000` in your web browser.

---

## 📋 8. CLI Flags Summary Table

| Flag | Argument Type | Description | Allowed Validators |
| :--- | :--- | :--- | :--- |
| `--all` | Flag | Runs across all active websites in inventory. | **Lightweight only** (`dns`, `ssl`, `http`). |
| `--specific <ID>` | String | Runs on a specific website ID from inventory. | **All validators** (`dns`, `ssl`, `http`, `ui`, `responsive`, `cross-browser`, `visual`). |
| `--url <URL>` | String | Runs directly on a single URL (ad-hoc). | **All validators**. |
| `--validator <name>` | String | Selects validator. Can be repeated. | `dns`, `ssl`, `http`, `ui`, `responsive`, `cross-browser`, `visual`. |
| `--headed` | Flag | Opens visible browser window (for Playwright). | `ui`, `responsive`, `cross-browser`, `visual`. |
| `--report` | Optional String | Generates Excel report in `./artifacts/reports/`. | Any. |
