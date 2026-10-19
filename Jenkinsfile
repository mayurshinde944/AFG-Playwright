pipeline {
    agent any

    options {
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm ci'
            }
        }

        stage('Install Playwright Browsers') {
            steps {
                bat 'npx playwright install --with-deps chromium firefox webkit'
            }
        }

        stage('Run QA') {
            steps {
                script {
                    // 1. Snapshot existing history files and modification times before execution to identify new or updated results accurately
                    bat 'node -e "(() => { const fs = require(\'fs\'); const path = require(\'path\'); const dir = \'artifacts/history/runs\'; const snapshot = {}; try { if (!fs.existsSync(dir)) { console.error(\'[Dashboard Sync] ERROR: Directory artifacts/history/runs does not exist.\'); process.exit(1); } for (const f of fs.readdirSync(dir)) { if (f.endsWith(\'.json\') && !f.startsWith(\'.\')) { snapshot[f] = fs.statSync(path.join(dir, f)).mtimeMs; } } fs.writeFileSync(\'.qa_pre_runs.json\', JSON.stringify(snapshot)); } catch (err) { console.error(\'[Dashboard Sync] ERROR: Failed to create pre-run history snapshot: \' + err.message); process.exit(1); } })()"'

                    // 2. Execute QA pipeline
                    def exitCode = bat(script: 'npm run qa', returnStatus: true)

                    // 3. Sync newly generated or updated run result JSON file(s) to the dashboard history directory
                    def syncCode = bat(script: 'node -e "(() => { const fs = require(\'fs\'); const path = require(\'path\'); const srcDir = \'artifacts/history/runs\'; const destDir = process.env.AFG_DASHBOARD_HISTORY_DIR || \'D:/invezza/AFG Automation - Copy/artifacts/history/runs\'; const snapshotFile = \'.qa_pre_runs.json\'; let preSnapshot = {}; try { preSnapshot = JSON.parse(fs.readFileSync(snapshotFile, \'utf8\')); } catch (err) { console.error(\'[Dashboard Sync] ERROR: Failed to read or parse pre-run snapshot: \' + err.message); process.exit(1); } try { fs.unlinkSync(snapshotFile); } catch (e) {} if (!fs.existsSync(srcDir)) { console.error(\'[Dashboard Sync] ERROR: Source directory artifacts/history/runs does not exist after QA execution.\'); process.exit(1); } const allFiles = fs.readdirSync(srcDir).filter(f => f.endsWith(\'.json\') && !f.startsWith(\'.\')); const newFiles = []; for (const file of allFiles) { try { const stat = fs.statSync(path.join(srcDir, file)); const prevMtime = preSnapshot[file]; if (prevMtime === undefined || stat.mtimeMs !== prevMtime) { newFiles.push(file); } } catch (err) { console.error(\'[Dashboard Sync] ERROR: Failed to inspect result file \' + file + \': \' + err.message); process.exit(1); } } if (newFiles.length === 0) { console.error(\'[Dashboard Sync] ERROR: No new or updated QA run result files found to sync.\'); process.exit(1); } try { if (!fs.existsSync(destDir)) { fs.mkdirSync(destDir, { recursive: true }); } } catch (err) { console.error(\'[Dashboard Sync] ERROR: Cannot create/access dashboard history directory: \' + err.message); process.exit(1); } let hasError = false; for (const file of newFiles) { try { const srcFile = path.join(srcDir, file); const destFile = path.join(destDir, file); fs.copyFileSync(srcFile, destFile); console.log(\'[Dashboard Sync] SUCCESS: Copied QA run result to dashboard: \' + file); } catch (err) { console.error(\'[Dashboard Sync] ERROR: Failed to copy \' + file + \' to dashboard: \' + err.message); hasError = true; } } if (hasError) process.exit(1); })()"', returnStatus: true)

                    // 4. Handle sync failure visibility without hiding QA status
                    def syncFailed = (syncCode != 0)
                    if (syncFailed) {
                        echo "═════════════════════════════════════════════════════════════════"
                        echo "[Dashboard Sync] ERROR: Dashboard synchronization failed."
                        echo "See logs above for details. QA results could not be synced."
                        echo "═════════════════════════════════════════════════════════════════"
                    }

                    // 5. Evaluate final build status based on QA exit code and sync result
                    if (exitCode == 0) {
                        if (syncFailed) {
                            currentBuild.result = 'UNSTABLE'
                            echo "[Dashboard Sync] Build marked UNSTABLE because dashboard sync failed despite QA passing."
                        } else {
                            currentBuild.result = 'SUCCESS'
                        }
                    } else if (exitCode == 1) {
                        currentBuild.result = 'FAILURE'
                        if (syncFailed) {
                            error("QA run failed with exit code 1 (and dashboard sync also failed)")
                        } else {
                            error("QA run failed with exit code 1")
                        }
                    } else if (exitCode == 2) {
                        currentBuild.result = 'UNSTABLE'
                        if (syncFailed) {
                            echo "[Dashboard Sync] Dashboard sync also failed for this unstable QA run."
                        }
                    } else {
                        currentBuild.result = 'FAILURE'
                        error("QA run failed with unexpected exit code ${exitCode}")
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'artifacts/history/runs/**', allowEmptyArchive: true
            archiveArtifacts artifacts: 'artifacts/reports/**', allowEmptyArchive: true
            archiveArtifacts artifacts: 'artifacts/screenshots/**', allowEmptyArchive: true
            archiveArtifacts artifacts: 'artifacts/visual/**', allowEmptyArchive: true
        }
    }
}
