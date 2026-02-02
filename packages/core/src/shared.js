export class GalgameCompileError extends Error {
  /**
   * @param {string} message
   * @param {{ diagnostics?: any }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "GalgameCompileError";
    this.diagnostics = options.diagnostics ?? null;
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizePosixPath(value) {
  return value.replaceAll("\\", "/");
}

