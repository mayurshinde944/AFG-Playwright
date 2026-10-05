'use strict';

class StatusTracker {
  constructor() {
    this.runs = new Map();
  }

  set(runId, status) {
    this.runs.set(runId, status);
  }

  get(runId) {
    return this.runs.get(runId);
  }
}

module.exports = new StatusTracker();
