/**
 * ===============================================================================
 * SHARED UTILITIES
 * ===============================================================================
 *
 * Common utility functions used across different provider handlers
 */

const Logger = require("../../../utils/logger");

/**
 * Safely extract nested value from object with multiple fallback paths
 *
 * @param {object} obj - Object to extract from
 * @param {...string} paths - Dot-notation paths to try (e.g., "metadata.metadata.agentId")
 * @returns {*} First found value or undefined
 *
 * @example
 * const agentId = safeExtract(metadata, "metadata.metadata.agentId", "metadata.agentId", "agentId");
 */
function safeExtract(obj, ...paths) {
  for (const path of paths) {
    try {
      let current = obj;
      const parts = path.split(".");

      for (const part of parts) {
        if (current && typeof current === "object" && current[part] !== undefined) {
          current = current[part];
        } else {
          current = undefined;
          break;
        }
      }

      if (current !== undefined) {
        return current;
      }
    } catch (error) {
      Logger.debug("Failed to extract path", { path, error: error.message });
    }
  }

  return undefined;
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && Object.keys(value).length === 0) return true;
  return false;
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map((item) => deepClone(item));

  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Merge objects deeply
 */
function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (typeof target === "object" && typeof source === "object") {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === "object" && !Array.isArray(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
  }

  return deepMerge(target, ...sources);
}

module.exports = {
  safeExtract,
  isEmpty,
  deepClone,
  deepMerge,
};
