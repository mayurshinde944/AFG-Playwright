'use strict';

class ValidatorRegistry {
  constructor() {
    this.validators = new Map();
  }

  /**
   * Registers a validator.
   * 
   * @param {string} name - Validator name (e.g., 'dns', 'ui')
   * @param {class|object} validatorClass - The validator implementation
   * @param {object} metadata - Must include { type: 'lightweight' | 'heavy' }
   */
  register(name, validatorClass, metadata = {}) {
    if (!name || !validatorClass) {
      throw new Error('Name and validatorClass are required');
    }
    
    if (metadata.type !== 'lightweight' && metadata.type !== 'heavy') {
      throw new Error('Validator metadata must specify type as "lightweight" or "heavy"');
    }

    this.validators.set(name.toLowerCase(), {
      implementation: validatorClass,
      metadata
    });
  }

  /**
   * Gets a validator by name.
   * 
   * @param {string} name 
   * @returns {object|null} The registered validator object
   */
  get(name) {
    return this.validators.get(name.toLowerCase()) || null;
  }

  /**
   * Returns all validators of a specific type.
   * 
   * @param {string} type - 'lightweight' or 'heavy'
   * @returns {object[]} Array of validator objects
   */
  getByType(type) {
    const results = [];
    for (const [name, data] of this.validators.entries()) {
      if (data.metadata.type === type) {
        results.push({ name, ...data });
      }
    }
    return results;
  }

  /**
   * Returns all registered validators.
   * 
   * @returns {object[]}
   */
  getAll() {
    const results = [];
    for (const [name, data] of this.validators.entries()) {
      results.push({ name, ...data });
    }
    return results;
  }
}

module.exports = ValidatorRegistry;
