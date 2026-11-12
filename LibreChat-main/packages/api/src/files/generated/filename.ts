import type { GeneratedFormat } from './types';

const EXTENSION_PATTERN = /\.([a-z0-9]{1,12})$/i;
const UNSAFE_FILENAME_CHARACTERS = /[<>:"/\\|?*]/g;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/;
const LEADING_DOTS_OR_SPACES = /^[. ]+/;
const MAX_FILENAME_BASE_LENGTH = 120;

function stripControlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      result += character;
    }
  }
  return result;
}

function basename(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

function splitExtension(name: string): { base: string; extension: string } {
  const match = EXTENSION_PATTERN.exec(name);
  if (match == null) {
    return { base: name, extension: '' };
  }
  return {
    base: name.slice(0, match.index),
    extension: match[1].toLowerCase(),
  };
}

function truncateBase(base: string): string {
  if (base.length <= MAX_FILENAME_BASE_LENGTH) {
    return base;
  }
  return base.slice(0, MAX_FILENAME_BASE_LENGTH).replace(/[. ]+$/, '');
}

/**
 * Produces a user-safe basename inside the caller's format allowlist.
 *
 * A supplied extension is kept only when the tool supports it; any other
 * extension (or no extension) is replaced with the tool's default. Directory
 * components, control characters, Windows-reserved characters, and leading or
 * trailing dots cannot survive, so the value is safe for local and object
 * storage keys.
 */
export function sanitizeGeneratedFilename<T extends GeneratedFormat>(
  value: string,
  allowedExtensions: readonly T[],
  defaultExtension: T,
): { filename: string; format: T } {
  const leaf = basename(String(value ?? '').trim());
  const { base, extension } = splitExtension(leaf);
  const format = allowedExtensions.find((allowed) => allowed === extension) ?? defaultExtension;

  let safeBase = stripControlCharacters(base)
    .replace(UNSAFE_FILENAME_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .replace(LEADING_DOTS_OR_SPACES, '')
    .replace(TRAILING_DOTS_OR_SPACES, '')
    .trim();

  safeBase = truncateBase(safeBase);
  if (safeBase.length === 0) {
    safeBase = 'generated-file';
  }

  return {
    filename: `${safeBase}.${format}`,
    format,
  };
}
