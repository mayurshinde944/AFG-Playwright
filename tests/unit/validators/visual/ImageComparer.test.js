'use strict';

const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;
const ImageComparer = require('../../../../src/validators/visual/ImageComparer');

describe('ImageComparer', () => {
  const artifactsDir = path.join(__dirname, 'test_artifacts');
  const baselinePath = path.join(artifactsDir, 'baseline.png');
  const actualMatchPath = path.join(artifactsDir, 'actual_match.png');
  const actualDiffPath = path.join(artifactsDir, 'actual_diff.png');
  const diffOutPath = path.join(artifactsDir, 'diff_out.png');
  
  beforeAll(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    // Create a 10x10 red image (baseline)
    const baseImg = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < baseImg.data.length; i += 4) {
      baseImg.data[i] = 255;   // R
      baseImg.data[i+1] = 0;   // G
      baseImg.data[i+2] = 0;   // B
      baseImg.data[i+3] = 255; // A
    }
    fs.writeFileSync(baselinePath, PNG.sync.write(baseImg));
    
    // Create an identical image
    fs.writeFileSync(actualMatchPath, PNG.sync.write(baseImg));
    
    // Create a 10x10 image with one pixel changed to blue (diff)
    const diffImg = new PNG({ width: 10, height: 10 });
    baseImg.data.copy(diffImg.data);
    diffImg.data[0] = 0;     // R
    diffImg.data[2] = 255;   // B
    fs.writeFileSync(actualDiffPath, PNG.sync.write(diffImg));
  });

  afterAll(() => {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  });

  it('should return PASS and 0% mismatch for identical images', async () => {
    const result = await ImageComparer.compare(baselinePath, actualMatchPath, null, 0.05);
    expect(result.match).toBe(true);
    expect(result.mismatchPercentage).toBe(0);
    expect(result.diffPixels).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('should detect a mismatched pixel but pass if under threshold', async () => {
    // 1 pixel out of 100 = 1% mismatch. Threshold is 2%
    const result = await ImageComparer.compare(baselinePath, actualDiffPath, null, 2.0);
    expect(result.match).toBe(true);
    expect(result.mismatchPercentage).toBe(1);
    expect(result.diffPixels).toBe(1);
  });

  it('should FAIL and generate a diff if mismatch exceeds threshold', async () => {
    // 1 pixel out of 100 = 1% mismatch. Threshold is 0.05%
    const result = await ImageComparer.compare(baselinePath, actualDiffPath, diffOutPath, 0.05);
    expect(result.match).toBe(false);
    expect(result.mismatchPercentage).toBe(1);
    expect(result.diffPixels).toBe(1);
    
    // Assert diff image was written
    expect(fs.existsSync(diffOutPath)).toBe(true);
  });

  it('should return error if baseline is missing', async () => {
    const result = await ImageComparer.compare('non_existent.png', actualMatchPath, null, 0.05);
    expect(result.match).toBe(false);
    expect(result.error).toMatch(/Baseline image not found/);
  });

  it('should return error if dimensions do not match', async () => {
    const wrongSizePath = path.join(artifactsDir, 'wrong.png');
    const wrongImg = new PNG({ width: 20, height: 20 });
    fs.writeFileSync(wrongSizePath, PNG.sync.write(wrongImg));

    const result = await ImageComparer.compare(baselinePath, wrongSizePath, null, 0.05);
    expect(result.match).toBe(false);
    expect(result.error).toMatch(/Dimension mismatch/);
  });
});
