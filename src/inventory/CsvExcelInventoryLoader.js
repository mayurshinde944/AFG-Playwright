/**
 * CSV / Excel Inventory Loader
 *
 * Loads website records from CSV or Excel files.
 * Returns ALL records (active and inactive) — the ScopeResolver
 * is responsible for filtering by active status.
 *
 * See: ARCHITECTURE.md §3, AGENTS.md §7
 */

'use strict';

const fs = require('fs');
const path = require('path');
const InventoryProvider = require('./InventoryProvider');
const Website = require('../models/Website');

class CsvExcelInventoryLoader extends InventoryProvider {
  /**
   * @param {string} filePath - Path to the inventory file (.csv, .xlsx, .xls)
   * @param {object} [options]
   * @param {object} [options.logger] - Optional logger instance
   */
  constructor(filePath, options = {}) {
    super();
    this.filePath = path.resolve(filePath);
    this.logger = options.logger || null;
  }

  /**
   * Load all websites from the inventory file.
   * Both active and inactive records are returned.
   *
   * @returns {Promise<Website[]>}
   */
  async loadWebsites() {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`Inventory file not found: ${this.filePath}`);
    }

    const ext = path.extname(this.filePath).toLowerCase();

    let websites;
    if (ext === '.csv') {
      websites = this._loadCsv();
    } else if (ext === '.xlsx' || ext === '.xls') {
      websites = this._loadExcel();
    } else {
      throw new Error(`Unsupported inventory file format: ${ext}. Use .csv, .xlsx, or .xls`);
    }

    if (this.logger) {
      this.logger.info(`Loaded ${websites.length} websites from ${path.basename(this.filePath)}`);
    }

    return websites;
  }

  /**
   * Parse a CSV file into Website instances.
   * @returns {Website[]}
   */
  _loadCsv() {
    const content = fs.readFileSync(this.filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    if (lines.length === 0) {
      return [];
    }

    const headers = this._parseCsvLine(lines[0]);
    const websites = [];
    const skipped = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this._parseCsvLine(lines[i]);
      const record = {};
      headers.forEach((header, idx) => {
        record[header.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
      });

      const website = Website.fromRecord(record);
      const errors = website.validate();

      if (errors.length === 0) {
        websites.push(website);
      } else {
        skipped.push({ line: i + 1, errors });
      }
    }

    if (skipped.length > 0 && this.logger) {
      this.logger.warn(`Skipped ${skipped.length} invalid records during CSV import`, { skipped });
    }

    return websites;
  }

  /**
   * Parse an Excel file into Website instances.
   * Uses the first sheet in the workbook.
   * @returns {Website[]}
   */
  _loadExcel() {
    // xlsx is a production dependency — loaded here to avoid
    // penalising CSV-only users with the import cost.
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(this.filePath);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('Excel workbook contains no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(sheet);

    const websites = [];
    const skipped = [];

    records.forEach((record, idx) => {
      const website = Website.fromRecord(record);
      const errors = website.validate();

      if (errors.length === 0) {
        websites.push(website);
      } else {
        skipped.push({ row: idx + 2, errors });
      }
    });

    if (skipped.length > 0 && this.logger) {
      this.logger.warn(`Skipped ${skipped.length} invalid records during Excel import`, { skipped });
    }

    return websites;
  }

  /**
   * Parse a single CSV line, handling quoted fields.
   *
   * @param {string} line
   * @returns {string[]}
   */
  _parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }
}

module.exports = CsvExcelInventoryLoader;
