/**
 * BrowserFactory provides a factory pattern for creating browser instances
 * supporting multiple browser implementations (Chrome/CDP, Firefox/RDP)
 */

const ChromeBrowser = require('./ChromeBrowser');
const FirefoxBrowser = require('./FirefoxBrowser');
const PlaywrightBrowser = require('./PlaywrightBrowser');
const { detectInstalledBrowsers } = require('./browserDetector');

class BrowserFactory {
  /**
   * Creates a browser instance based on specified type or auto-detection
   * @param {Object} options - Browser configuration options
   * @param {string} options.browserType - Type of browser to use ('chrome', 'firefox', 'playwright', 'auto')
   * @param {boolean} options.useNative - Whether to use native protocols instead of Playwright
   * @param {Object} options.browserArgs - Browser-specific launch arguments
   * @returns {Object} - A browser controller instance
   */
  static async createBrowser(options = {}) {
    // Set default options
    const browserOptions = {
      browserType: options.browserType || 'auto',
      useNative: options.useNative === true,
      headless: options.headless !== false,
      browserArgs: options.browserArgs || {},
      ...options
    };
    
    console.log(`Creating browser with options: ${JSON.stringify(browserOptions, null, 2)}`);
    
    // Auto-detect browser if set to 'auto'
    if (browserOptions.browserType === 'auto') {
      const installedBrowsers = await detectInstalledBrowsers();
      console.log(`Detected browsers: ${installedBrowsers.join(', ')}`);
      
      if (installedBrowsers.includes('chrome')) {
        browserOptions.browserType = 'chrome';
      } else if (installedBrowsers.includes('firefox')) {
        browserOptions.browserType = 'firefox';
      } else {
        // Fallback to Playwright
        browserOptions.browserType = 'playwright';
        browserOptions.useNative = false;
      }
      
      console.log(`Auto-selected browser: ${browserOptions.browserType}`);
    }
    
    // Create the appropriate browser instance
    switch (browserOptions.browserType.toLowerCase()) {
      case 'chrome':
        if (browserOptions.useNative) {
          console.log('Creating native Chrome browser with CDP');
          return new ChromeBrowser(browserOptions);
        } else {
          console.log('Using Playwright for Chrome');
          return new PlaywrightBrowser({
            ...browserOptions,
            browserName: 'chromium'
          });
        }
        
      case 'firefox':
        if (browserOptions.useNative) {
          console.log('Creating native Firefox browser with RDP');
          return new FirefoxBrowser(browserOptions);
        } else {
          console.log('Using Playwright for Firefox');
          return new PlaywrightBrowser({
            ...browserOptions,
            browserName: 'firefox'
          });
        }
        
      case 'webkit':
      case 'safari':
        console.log('Using Playwright for WebKit/Safari');
        return new PlaywrightBrowser({
          ...browserOptions,
          browserName: 'webkit'
        });
        
      case 'playwright':
      default:
        console.log('Using Playwright with default browser (chromium)');
        return new PlaywrightBrowser(browserOptions);
    }
  }
}

module.exports = BrowserFactory; 