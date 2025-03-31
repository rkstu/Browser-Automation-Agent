// Configuration for the Browser Automation Agent

require('dotenv').config();

module.exports = {
  // OpenAI API configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '150'),
  },
  
  // Browser settings
  browser: {
    headless: process.env.BROWSER_HEADLESS === 'true',
    defaultBrowser: process.env.DEFAULT_BROWSER || 'chromium', // chromium, firefox, webkit, chrome, auto
    useNative: process.env.USE_NATIVE_BROWSER === 'true', // Whether to use native browser protocols instead of Playwright
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000'), // Default timeout in ms
    viewport: {
      width: parseInt(process.env.VIEWPORT_WIDTH || '1280'),
      height: parseInt(process.env.VIEWPORT_HEIGHT || '800'),
    },
    args: (process.env.BROWSER_ARGS || '').split(',').filter(Boolean), // Browser launch arguments
    userAgent: process.env.USER_AGENT || '', // Custom user agent
    extraHeaders: process.env.EXTRA_HEADERS ? JSON.parse(process.env.EXTRA_HEADERS) : {},
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === 'true',
  },
  
  // Proxy settings
  proxy: process.env.USE_PROXY === 'true' ? {
    server: process.env.PROXY_SERVER || '',
    username: process.env.PROXY_USERNAME || '',
    password: process.env.PROXY_PASSWORD || '',
    rotate: process.env.ROTATE_PROXY === 'true',
    rotationInterval: parseInt(process.env.PROXY_ROTATION_INTERVAL || '600000') // 10 minutes
  } : null,
  
  // Session management
  session: {
    enabled: process.env.USE_SESSION === 'true',
    directory: process.env.SESSION_DIR || './sessions',
    encryption: process.env.ENCRYPT_SESSIONS === 'true',
    encryptionKey: process.env.SESSION_ENCRYPTION_KEY || '',
    defaultSession: process.env.DEFAULT_SESSION || '',
    autoSave: process.env.AUTO_SAVE_SESSION === 'true',
    saveInterval: parseInt(process.env.SESSION_SAVE_INTERVAL || '300000') // 5 minutes
  },
  
  // Extension settings
  extensions: {
    enabled: process.env.USE_EXTENSIONS === 'true',
    directories: (process.env.EXTENSION_DIRS || '').split(',').filter(Boolean),
    paths: (process.env.EXTENSION_PATHS || '').split(',').filter(Boolean)
  },
  
  // Error handling configuration
  errorHandling: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10), // Delay between retries in ms
    takeScreenshots: process.env.ERROR_SCREENSHOTS === 'true',
    screenshotDir: process.env.SCREENSHOT_DIR || './error-screenshots',
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
    toFile: process.env.LOG_TO_FILE === 'true',
    filePath: process.env.LOG_FILE_PATH || './logs',
    browserConsole: process.env.LOG_BROWSER_CONSOLE === 'true', // Log browser console messages
    networkRequests: process.env.LOG_NETWORK_REQUESTS === 'true', // Log network requests
  },
  
  // Data extraction settings
  extraction: {
    defaultFormat: process.env.EXTRACT_FORMAT || 'json', // json, csv, html
    outputDir: process.env.EXTRACT_OUTPUT_DIR || './exports',
    useAI: process.env.USE_AI_EXTRACTION === 'true', // Use AI to enhance extraction
  },
  
  // Kaggle-specific configuration
  kaggle: {
    username: process.env.KAGGLE_USERNAME || '',
    password: process.env.KAGGLE_PASSWORD || '',
  }
}; 