'use strict';

const fs = require('fs');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');
const path = require('path');

class ImageComparer {
  /**
   * Compare two images and save a diff image if provided.
   * @param {string} baselinePath Path to the baseline image
   * @param {string} actualPath Path to the actual image
   * @param {string|null} diffPath Path to save the diff image (optional)
   * @param {number} threshold Mismatch threshold (e.g., 0.05 for 0.05% pixel mismatch)
   * @returns {Promise<{ match: boolean, mismatchPercentage: number, diffPixels: number, error?: string }>}
   */
  static async compare(baselinePath, actualPath, diffPath, threshold = 0.05) {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(baselinePath)) {
          return resolve({ match: false, mismatchPercentage: 100, diffPixels: -1, error: `Baseline image not found: ${baselinePath}` });
        }
        if (!fs.existsSync(actualPath)) {
          return resolve({ match: false, mismatchPercentage: 100, diffPixels: -1, error: `Actual image not found: ${actualPath}` });
        }

        const img1 = PNG.sync.read(fs.readFileSync(baselinePath));
        const img2 = PNG.sync.read(fs.readFileSync(actualPath));
        const { width, height } = img1;

        if (width !== img2.width || height !== img2.height) {
          // If dimensions don't match, we immediately fail it completely
          return resolve({
            match: false,
            mismatchPercentage: 100,
            diffPixels: -1,
            error: `Dimension mismatch: Baseline is ${width}x${height}, Actual is ${img2.width}x${img2.height}`
          });
        }

        const diff = new PNG({ width, height });
        const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });
        const totalPixels = width * height;
        const mismatchPercentage = (diffPixels / totalPixels) * 100;

        const match = mismatchPercentage <= threshold;

        if (!match && diffPath) {
          // Ensure directory exists
          const dir = path.dirname(diffPath);
          if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(diffPath, PNG.sync.write(diff));
        }

        resolve({
          match,
          mismatchPercentage: parseFloat(mismatchPercentage.toFixed(4)),
          diffPixels
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = ImageComparer;
