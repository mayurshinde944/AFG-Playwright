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
                    def exitCode = bat(script: 'npm run qa', returnStatus: true)
                    if (exitCode == 0) {
                        currentBuild.result = 'SUCCESS'
                    } else if (exitCode == 1) {
                        currentBuild.result = 'FAILURE'
                        error("QA run failed with exit code 1")
                    } else if (exitCode == 2) {
                        currentBuild.result = 'UNSTABLE'
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
