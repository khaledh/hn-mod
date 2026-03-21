/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { isFrontPage, isListingPage } from '../src/page.js';

// jsdom provides window.location; we override pathname via history API workaround
function setPath(path) {
  // jsdom doesn't support navigation, so we replace the property directly
  Object.defineProperty(window, 'location', {
    value: { ...window.location, pathname: path },
    writable: true,
    configurable: true,
  });
}

describe('isFrontPage', () => {
  it('returns true for /', () => {
    setPath('/');
    expect(isFrontPage()).toBe(true);
  });

  it('returns true for /news', () => {
    setPath('/news');
    expect(isFrontPage()).toBe(true);
  });

  it('returns false for /newest', () => {
    setPath('/newest');
    expect(isFrontPage()).toBe(false);
  });

  it('returns false for /show', () => {
    setPath('/show');
    expect(isFrontPage()).toBe(false);
  });
});

describe('isListingPage', () => {
  it('returns true for /', () => {
    setPath('/');
    expect(isListingPage()).toBe(true);
  });

  it('returns true for /newest', () => {
    setPath('/newest');
    expect(isListingPage()).toBe(true);
  });

  it('returns true for /show', () => {
    setPath('/show');
    expect(isListingPage()).toBe(true);
  });

  it('returns false for /item', () => {
    setPath('/item');
    expect(isListingPage()).toBe(false);
  });

  it('returns false for /threads', () => {
    setPath('/threads');
    expect(isListingPage()).toBe(false);
  });

  it('returns false for /user', () => {
    setPath('/user');
    expect(isListingPage()).toBe(false);
  });
});
