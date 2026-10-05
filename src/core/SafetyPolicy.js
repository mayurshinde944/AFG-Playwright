'use strict';

class SafetyPolicy {
  /**
   * Validates an ExecutionPlan to ensure it doesn't violate production safety rules.
   * 
   * @param {import('../models/ExecutionPlan')} plan 
   * @param {object} config - Global config to access validator classifications
   * @returns {{allowed: boolean, violations: string[]}}
   */
  static evaluate(plan, config) {
    const violations = [];

    // Rule: High-load manual overrides require explicit confirmation.
    // If forceOverride is true, we bypass safety blocks but log it as a warning in caller.
    if (plan.forceOverride) {
      return { allowed: true, violations: [] };
    }

    // Identify if plan contains any heavy validators
    const heavyValidatorsConfig = config.validators.heavy || [];
    const containsHeavy = plan.validators.some(v => heavyValidatorsConfig.includes(v.toLowerCase()));

    // Rule: ALL scope + heavy validators is blocked by default
    if (plan.scope === 'all' && containsHeavy) {
      violations.push('Cannot run heavy browser validators (UI, Responsive, Cross-browser, Visual) against ALL websites without forceOverride.');
    }

    // Rule: ALL scope + lightweight validators is inherently allowed if containsHeavy is false
    // (We do not push a violation for this).
    
    // Safety check on concurrency limits
    if (plan.concurrency.browserWorkers > 5 && containsHeavy) {
      violations.push('Browser worker concurrency exceeds safe limits for heavy testing without forceOverride.');
    }
    
    if (plan.concurrency.infrastructureConcurrency > 20) {
      violations.push('Infrastructure concurrency exceeds safe limits without forceOverride.');
    }

    return {
      allowed: violations.length === 0,
      violations
    };
  }
}

module.exports = SafetyPolicy;
