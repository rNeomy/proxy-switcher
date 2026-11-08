'use strict';

/* global app */

// Strict deep-equal for profile comparison.
// Ignores remoteDNS, noPrompt, levelOfControl at any depth.
// Loads after utils.js in panel, Firefox background, and worker.
app.compare = (a, b) => {
  const ignore = new Set(['remoteDNS', 'noPrompt', 'levelOfControl']);

  const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNumericString = v => {
    if (typeof v !== 'string') {
      return false;
    }
    const t = v.trim();
    return t !== '' && /^\d+$/.test(t);
  };
  const numericEqual = (x, y) => {
    if (typeof x === 'number' && isNumericString(y)) {
      return x === Number(y.trim());
    }
    if (typeof y === 'number' && isNumericString(x)) {
      return y === Number(x.trim());
    }
    return false;
  };

  const compare = (x, y) => {
    if (x === y) {
      return true;
    }
    if (x == null || y == null) {
      return false;
    }
    if (numericEqual(x, y)) {
      return true;
    }
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y)) {
        return false;
      }
      if (x.length !== y.length) {
        return false;
      }
      for (let i = 0; i < x.length; i++) {
        if (!compare(x[i], y[i])) {
          return false;
        }
      }
      return true;
    }
    if (isPlainObject(x) && isPlainObject(y)) {
      const kx = Object.keys(x).filter(k => !ignore.has(k));
      const ky = Object.keys(y).filter(k => !ignore.has(k));
      if (kx.length !== ky.length) {
        return false;
      }
      for (const k of kx) {
        if (!Object.prototype.hasOwnProperty.call(y, k)) {
          return false;
        }
        if (!compare(x[k], y[k])) {
          return false;
        }
      }
      return true;
    }
    return false;
  };

  return compare(a, b);
};
