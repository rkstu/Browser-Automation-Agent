/**
 * Browser detection utilities to identify which browsers are installed
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

// Convert exec to use promises
const execAsync = util.promisify(exec);

/**
 * Common browser installation paths for each platform
 */
const browserPaths = {
  win32: {
    chrome: [
      '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
      '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe',
      '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe'
    ],
    firefox: [
      '%ProgramFiles%\\Mozilla Firefox\\firefox.exe',
      '%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe'
    ],
    edge: [
      '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe',
      '%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe'
    ]
  },
  darwin: {
    chrome: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ],
    firefox: [
      '/Applications/Firefox.app/Contents/MacOS/firefox',
      '~/Applications/Firefox.app/Contents/MacOS/firefox'
    ],
    safari: [
      '/Applications/Safari.app/Contents/MacOS/Safari'
    ]
  },
  linux: {
    chrome: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ],
    firefox: [
      '/usr/bin/firefox',
      '/usr/bin/firefox-esr'
    ]
  }
};

/**
 * Commands to detect browsers on different platforms
 */
const detectionCommands = {
  win32: {
    chrome: 'where chrome',
    firefox: 'where firefox',
    edge: 'where msedge'
  },
  darwin: {
    chrome: 'mdfind "kMDItemCFBundleIdentifier == com.google.Chrome"',
    firefox: 'mdfind "kMDItemCFBundleIdentifier == org.mozilla.firefox"',
    safari: 'mdfind "kMDItemCFBundleIdentifier == com.apple.Safari"'
  },
  linux: {
    chrome: 'which google-chrome google-chrome-stable chromium chromium-browser',
    firefox: 'which firefox firefox-esr'
  }
};

/**
 * Check if a file exists, expanding environment variables
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} - Whether file exists
 */
async function fileExists(filePath) {
  // Expand environment variables on Windows
  const expandedPath = filePath.replace(/%([^%]+)%/g, (_, envVar) => {
    return process.env[envVar] || '';
  });
  
  // Expand tilde to home directory
  const normalizedPath = expandedPath.replace(/^~/, os.homedir());
  
  try {
    await fs.promises.access(normalizedPath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Detect browsers by checking common installation paths
 * @returns {Promise<Array<string>>} - List of detected browsers
 */
async function detectByPaths() {
  const platform = os.platform();
  const paths = browserPaths[platform] || {};
  const detected = [];
  
  // Check each browser type
  for (const [browser, browserPaths] of Object.entries(paths)) {
    // Check each possible path for this browser
    for (const browserPath of browserPaths) {
      if (await fileExists(browserPath)) {
        detected.push(browser);
        break; // Found one path for this browser, move to next browser
      }
    }
  }
  
  return detected;
}

/**
 * Detect browsers using platform-specific commands
 * @returns {Promise<Array<string>>} - List of detected browsers
 */
async function detectByCommands() {
  const platform = os.platform();
  const commands = detectionCommands[platform] || {};
  const detected = [];
  
  // Try each command
  for (const [browser, command] of Object.entries(commands)) {
    try {
      const { stdout } = await execAsync(command);
      if (stdout.trim()) {
        detected.push(browser);
      }
    } catch (err) {
      // Command failed, browser not found
    }
  }
  
  return detected;
}

/**
 * Detect installed browsers using multiple methods
 * @returns {Promise<Array<string>>} - List of detected browsers
 */
async function detectInstalledBrowsers() {
  // Try both detection methods and combine results
  const byPaths = await detectByPaths();
  const byCommands = await detectByCommands();
  
  // Combine and deduplicate
  const combined = [...new Set([...byPaths, ...byCommands])];
  
  if (combined.length === 0) {
    // If no browsers detected, we can still use Playwright
    return ['playwright'];
  }
  
  return combined;
}

module.exports = {
  detectInstalledBrowsers,
  detectByPaths,
  detectByCommands
}; 