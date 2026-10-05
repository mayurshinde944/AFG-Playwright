'use strict';

const PageSampler = require('../../../../src/validators/ui/PageSampler');

describe('PageSampler', () => {
  it('should always include homepage and return only homepage if maxPages is 1', () => {
    const urls = PageSampler.sample('https://example.com', [{href: 'https://example.com/about', text: 'about'}], 1);
    expect(urls).toEqual(['https://example.com']);
  });

  it('should remove duplicates and self-references', () => {
    const links = [
      { href: 'https://example.com/about', text: 'about' },
      { href: 'https://example.com/about', text: 'about us' },
      { href: 'https://example.com/about/', text: 'about us' },
      { href: 'https://example.com/#top', text: 'top' },
      { href: 'https://example.com', text: 'home' }
    ];
    const urls = PageSampler.sample('https://example.com', links, 10);
    expect(urls).toEqual(['https://example.com', 'https://example.com/about']);
  });

  it('should exclude external domains, mailto, tel, javascript, pdfs', () => {
    const links = [
      { href: 'https://google.com', text: 'google' },
      { href: 'mailto:test@example.com', text: 'email' },
      { href: 'tel:123456', text: 'call' },
      { href: 'javascript:void(0)', text: 'js' },
      { href: 'https://example.com/doc.pdf', text: 'pdf' },
      { href: 'https://example.com/image.jpg', text: 'jpg' },
      { href: 'https://example.com/valid', text: 'valid' }
    ];
    const urls = PageSampler.sample('https://example.com', links, 10);
    expect(urls).toEqual(['https://example.com', 'https://example.com/valid']);
  });

  it('should identify priority pages by URL and text', () => {
    const links = [
      { href: 'https://example.com/random1', text: 'random' },
      { href: 'https://example.com/somepath', text: 'contact us' }, // match text
      { href: 'https://example.com/faq', text: 'questions' }, // match url
      { href: 'https://example.com/random2', text: 'random2' }
    ];
    
    const urls = PageSampler.sample('https://example.com', links, 10);
    
    expect(urls[0]).toBe('https://example.com');
    // Next 2 should be the priority pages
    const prioritySubset = urls.slice(1, 3);
    expect(prioritySubset).toContain('https://example.com/somepath');
    expect(prioritySubset).toContain('https://example.com/faq');
    
    const remaining = urls.slice(3);
    expect(remaining).toContain('https://example.com/random1');
    expect(remaining).toContain('https://example.com/random2');
  });

  it('should respect maxPages limit', () => {
    const links = [];
    for (let i = 0; i < 20; i++) {
      links.push({ href: `https://example.com/page${i}`, text: `page${i}` });
    }
    const urls = PageSampler.sample('https://example.com', links, 10);
    expect(urls.length).toBe(10);
    expect(urls[0]).toBe('https://example.com');
  });

  it('should be deterministically testable with a fixed random function', () => {
    const links = [
      { href: 'https://example.com/a', text: 'a' },
      { href: 'https://example.com/b', text: 'b' },
      { href: 'https://example.com/c', text: 'c' }
    ];
    // A stable "random" function that always reverses the array
    const urls = PageSampler.sample('https://example.com', links, 10, () => 0.1);
    expect(urls).toEqual(['https://example.com', 'https://example.com/c', 'https://example.com/b', 'https://example.com/a']);
  });

  it('should ignore malformed URLs', () => {
    const links = [
      { href: 'http://', text: 'bad' },
      { href: 'https://example.com/good', text: 'good' }
    ];
    const urls = PageSampler.sample('https://example.com', links, 10);
    expect(urls).toEqual(['https://example.com', 'https://example.com/good']);
  });
});
