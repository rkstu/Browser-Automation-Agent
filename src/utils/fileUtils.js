/**
 * File utility functions for handling files and paths
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Sanitize a filename to make it safe for file system
 * @param {string} filename - The filename to sanitize
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename) return 'file';
  
  // Replace invalid characters
  let sanitized = filename
    .replace(/[\\/:*?"<>|]/g, '_') // Replace invalid Windows chars
    .replace(/\s+/g, '_')          // Replace spaces with underscores
    .replace(/^\.+/, '')           // Remove leading dots
    .replace(/\.+$/, '');          // Remove trailing dots
  
  // Ensure filename isn't too long
  if (sanitized.length > 200) {
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);
    sanitized = base.substring(0, 190) + ext;
  }
  
  // If the sanitization left an empty string, use a default
  if (!sanitized) {
    sanitized = 'file_' + Date.now();
  }
  
  return sanitized;
}

/**
 * Create a directory if it doesn't exist
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<boolean>} - Whether the directory was created
 */
async function ensureDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error creating directory:', error);
    throw error;
  }
}

/**
 * Generate a temporary filename
 * @param {string} prefix - Prefix for the filename
 * @param {string} extension - File extension (without dot)
 * @returns {string} - Generated filename
 */
function getTempFilename(prefix = 'tmp', extension = 'json') {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${randomString}.${extension}`;
}

/**
 * Save data to a file
 * @param {string} filePath - Path to save the file
 * @param {string|Object} data - Data to save
 * @param {Object} options - Save options
 * @returns {Promise<string>} - Path to the saved file
 */
async function saveToFile(filePath, data, options = {}) {
  const { ensureDir = true, format = 'auto' } = options;
  
  // Ensure the directory exists
  if (ensureDir) {
    await ensureDirectory(path.dirname(filePath));
  }
  
  // Convert objects to JSON if needed
  let fileData = data;
  if (typeof data === 'object') {
    if (format === 'json' || format === 'auto') {
      fileData = JSON.stringify(data, null, 2);
    } else {
      throw new Error(`Unsupported format for object data: ${format}`);
    }
  }
  
  // Write to file
  await fs.promises.writeFile(filePath, fileData);
  return filePath;
}

/**
 * Load data from a file
 * @param {string} filePath - Path to the file
 * @param {Object} options - Load options
 * @returns {Promise<any>} - Loaded data
 */
async function loadFromFile(filePath, options = {}) {
  const { format = 'auto' } = options;
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  // Read file
  const fileData = await fs.promises.readFile(filePath, 'utf8');
  
  // Parse based on format
  if (format === 'json' || (format === 'auto' && filePath.endsWith('.json'))) {
    return JSON.parse(fileData);
  }
  
  // Return raw data for other formats
  return fileData;
}

/**
 * Delete a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - Whether the file was deleted
 */
async function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

module.exports = {
  sanitizeFilename,
  ensureDirectory,
  getTempFilename,
  saveToFile,
  loadFromFile,
  deleteFile
}; 