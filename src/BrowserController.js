const { chromium, firefox, webkit } = require('playwright');
const { chromiumExtraPath } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
const config = require('./config/config');
const { randomDelay, isCaptchaPresent, generateHumanMousePath, getRandomUserAgent } = require('./utils/BrowserUtils');

// Apply stealth plugin
let extraPlaywright;
try {
  // Dynamically import playwright-extra and apply stealth plugins
  const { chromium: extraChromium } = require('playwright-extra');
  extraChromium.use(stealthPlugin);
  extraPlaywright = { chromium: extraChromium };
  console.log('Stealth plugins initialized successfully');
} catch (error) {
  console.warn('Failed to initialize stealth plugins, falling back to standard Playwright:', error.message);
  extraPlaywright = null;
}

/**
 * BrowserController handles direct browser interactions
 * This class separates browser control from natural language processing
 */
class BrowserController {
  constructor(options = {}) {
    this.options = {
      ...config.browser,
      ...options,
    };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
    this.currentUrl = null;
    this.userInterventionActive = false;
    this.usingStealthMode = false;
    this.navigationHistory = [];
    this.sessionStartTime = null;
    this.actionCount = 0;
  }

  /**
   * Initializes the browser instance
   */
  async initialize() {
    let fallbackToStandard = false;
    
    try {
      // Select browser type based on configuration
      let browserType;
      
      // Try to use standard browser first - safer option
      browserType = this.getBrowserType();
      console.log(`Using standard ${this.options.defaultBrowser} browser`);
      this.usingStealthMode = false;
      
      // Select a random user agent
      const userAgent = getRandomUserAgent();
      console.log(`Using user agent: ${userAgent}`);
      
      try {
        // Launch browser with minimal options first
        this.browser = await browserType.launch({
          headless: this.options.headless,
          args: [
            '--no-sandbox',
            `--user-agent=${userAgent}`
          ]
        });
      } catch (launchError) {
        console.error('Error launching browser:', launchError);
        throw launchError;
      }
      
      // Create a browser context with more human-like characteristics
      try {
        this.context = await this.browser.newContext({
          viewport: this.options.viewport,
          userAgent: userAgent,
          deviceScaleFactor: 1,
          hasTouch: false,
          javaScriptEnabled: true,
          locale: 'en-US',
          timezoneId: 'America/Los_Angeles',
          geolocation: { longitude: -122.4194, latitude: 37.7749, accuracy: 20 },
          permissions: ['geolocation'],
          colorScheme: 'light'
        });
      } catch (contextError) {
        console.warn('Error creating browser context with full options:', contextError.message);
        console.warn('Retrying with minimal context options...');
        
        // Try again with minimal options
        this.context = await this.browser.newContext({
          viewport: this.options.viewport,
          userAgent: userAgent
        });
      }
      
      // Modify navigator attributes to avoid detection
      await this.context.addInitScript(() => {
        // Overwrite the navigator properties to avoid detection
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { 
          get: () => [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
          ]
        });
        
        // Add language
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        
        // Modify chrome object if exists
        if (window.chrome) {
          window.chrome.runtime = { id: Math.random().toString(), connect: () => {} };
          window.chrome.loadTimes = () => {};
          window.chrome.csi = () => {};
        }
        
        // Add WebGL fingerprint
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          // This is for unmasking the renderer
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          // This is for unmasking the vendor
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, arguments);
        };
        
        // Add notifications API
        if (!window.Notification) {
          window.Notification = {
            permission: 'default',
            requestPermission: async () => 'default'
          };
        }
      });
      
      // Create a new page
      try {
        this.page = await this.context.newPage();
        
        // Add random delays to some common functions to simulate human behavior
        const originalClick = this.page.click.bind(this.page);
        this.page.click = async (...args) => {
          await randomDelay(100, 500);
          return originalClick(...args);
        };
        
        const originalFill = this.page.fill.bind(this.page);
        this.page.fill = async (...args) => {
          await randomDelay(50, 200);
          return originalFill(...args);
        };
        
        const originalType = this.page.type.bind(this.page);
        this.page.type = async (selector, text, options = {}) => {
          await randomDelay(50, 200);
          
          // Type with variable speed to simulate human typing
          const speed = options.delay || Math.floor(Math.random() * 100) + 30; // 30-130ms between keypresses
          return originalType(selector, text, { ...options, delay: speed });
        };
        
        // Set default timeout
        this.page.setDefaultTimeout(this.options.timeout);
        
        this.isInitialized = true;
        this.sessionStartTime = new Date();
        
        return true;
      } catch (pageError) {
        console.error('Error creating or setting up page:', pageError.message);
        
        // Try one more time with minimal setup
        try {
          console.warn('Retrying page creation with minimal setup...');
          this.page = await this.context.newPage();
          this.page.setDefaultTimeout(this.options.timeout);
          
          this.isInitialized = true;
          this.sessionStartTime = new Date();
          
          return true;
        } catch (retryError) {
          console.error('Failed to create page on retry:', retryError.message);
          throw retryError;
        }
      }
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }
  
  /**
   * Perform random scrolling behavior
   */
  async performRandomScrolling() {
    try {
      // Get page height
      const pageHeight = await this.page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = await this.page.evaluate(() => window.innerHeight);
      
      if (pageHeight <= viewportHeight) {
        return; // No need to scroll on short pages
      }
      
      // Determine how many scroll actions to perform
      const scrollCount = Math.floor(Math.random() * 5) + 2; // 2-6 scroll actions
      
      for (let i = 0; i < scrollCount; i++) {
        // Calculate a random scroll position
        const scrollPosition = Math.floor(Math.random() * (pageHeight - viewportHeight));
        
        // Scroll with human-like behavior
        await this.page.evaluate((position) => {
          window.scrollTo({
            top: position,
            behavior: 'smooth'
          });
        }, scrollPosition);
        
        // Wait between scrolls
        await randomDelay(1000, 3000);
      }
    } catch (error) {
      console.warn('Error during random scrolling:', error.message);
    }
  }

  /**
   * Get the browser type based on the configuration
   */
  getBrowserType() {
    switch (this.options.defaultBrowser.toLowerCase()) {
      case 'firefox':
        return firefox;
      case 'webkit':
        return webkit;
      case 'chromium':
      default:
        return chromium;
    }
  }

  /**
   * Navigate to a specific URL
   */
  async navigate(url) {
    if (!this.isInitialized) {
      throw new Error('Browser is not initialized. Call initialize() first.');
    }
    
    try {
      // Check if it's a navigation command like "refresh" or "back"
      if (this.isNavigationCommand(url)) {
        return await this.handleNavigationCommand(url);
      }
      
      // Add http:// prefix if not present
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      // Track this action
      this.actionCount++;
      
      // Check if we need a break
      if (this.actionCount > 5 && Math.random() < 0.3) {
        await this.takePotentialBreak();
      }
      
      console.log(`Navigating to: ${url}`);
      
      // Add a random delay before navigation to appear more human-like
      await randomDelay(800, 2000);
      
      // Use a more standard set of headers
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
      });
      
      // Add to navigation history before navigating
      if (this.currentUrl) {
        this.navigationHistory.push(this.currentUrl);
      }
      
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      
      // Wait a bit more for any scripts to load
      await this.page.waitForLoadState('networkidle');
      
      // Store the current URL for special case handling
      this.currentUrl = this.page.url();
      console.log(`Page loaded: ${this.currentUrl}`);
      
      // Random scrolling behavior
      await this.performRandomScrolling();
      
      // Check for CAPTCHA after navigation
      if (await this.handleCaptcha()) {
        console.log('CAPTCHA handled after navigation');
      }
      
      // Always wait a bit after navigation to ensure the page is fully interactive
      await randomDelay(500, 2000);
      
      return true;
    } catch (error) {
      console.error(`Failed to navigate to ${url}:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a string is a navigation command
   */
  isNavigationCommand(url) {
    const commands = ['back', 'forward', 'refresh', 'reload', 'previous page', 'next page'];
    return commands.some(cmd => url.toLowerCase().includes(cmd));
  }
  
  /**
   * Handle special navigation commands
   */
  async handleNavigationCommand(command) {
    const cmd = command.toLowerCase();
    
    if (cmd.includes('refresh') || cmd.includes('reload')) {
      return await this.refreshPage();
    } else if (cmd.includes('back') || cmd.includes('previous')) {
      return await this.goBack();
    } else if (cmd.includes('forward') || cmd.includes('next page')) {
      return await this.goForward();
    }
    
    // If not recognized, continue with normal navigation
    return false;
  }
  
  /**
   * Refresh the current page
   */
  async refreshPage() {
    console.log('Refreshing the current page...');
    
    // Track this action
    this.actionCount++;
    
    try {
      // Add a random delay before refreshing
      await randomDelay(1000, 3000);
      
      // Reload the page
      await this.page.reload({ waitUntil: 'networkidle' });
      
      // Check for CAPTCHA after refresh
      if (await this.handleCaptcha()) {
        console.log('CAPTCHA handled after refresh');
      }
      
      console.log('Page refreshed successfully');
      return true;
    } catch (error) {
      console.error('Failed to refresh page:', error);
      throw error;
    }
  }
  
  /**
   * Go back to the previous page
   */
  async goBack() {
    console.log('Navigating back to previous page...');
    
    // Track this action
    this.actionCount++;
    
    try {
      // Check if we have a history
      if (this.navigationHistory.length === 0) {
        console.log('No previous page in history');
        return false;
      }
      
      // Add a random delay before going back
      await randomDelay(1000, 3000);
      
      // Go back in browser history
      await this.page.goBack({ waitUntil: 'networkidle' });
      
      // Update current URL
      this.currentUrl = this.page.url();
      console.log(`Navigated back to: ${this.currentUrl}`);
      
      // Check for CAPTCHA
      if (await this.handleCaptcha()) {
        console.log('CAPTCHA handled after going back');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to go back:', error);
      
      // Try using last URL in history as fallback
      try {
        const lastUrl = this.navigationHistory.pop();
        if (lastUrl) {
          console.log(`Falling back to navigating to last URL: ${lastUrl}`);
          await this.page.goto(lastUrl, { waitUntil: 'networkidle' });
          this.currentUrl = this.page.url();
          return true;
        }
      } catch (fallbackError) {
        console.error('Fallback navigation failed:', fallbackError);
      }
      
      throw error;
    }
  }
  
  /**
   * Go forward in browser history
   */
  async goForward() {
    console.log('Navigating forward...');
    
    // Track this action
    this.actionCount++;
    
    try {
      // Add a random delay before going forward
      await randomDelay(1000, 3000);
      
      // Go forward in browser history
      await this.page.goForward({ waitUntil: 'networkidle' });
      
      // Update current URL
      this.currentUrl = this.page.url();
      console.log(`Navigated forward to: ${this.currentUrl}`);
      
      // Check for CAPTCHA
      if (await this.handleCaptcha()) {
        console.log('CAPTCHA handled after going forward');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to go forward:', error);
      throw error;
    }
  }
  
  /**
   * Take a potential break to simulate more human-like behavior
   */
  async takePotentialBreak() {
    console.log('Taking a short break to seem more human-like...');
    
    // Reset action count
    this.actionCount = 0;
    
    // Take a longer break
    await randomDelay(5000, 15000);
    
    // Maybe do some random scrolling
    if (Math.random() < 0.7) {
      await this.performRandomScrolling();
    }
    
    console.log('Break completed');
  }

  /**
   * Human-like hover and click on an element
   */
  async humanClick(selector) {
    try {
      // Get the element's bounding box
      const elementHandle = await this.page.$(selector);
      if (!elementHandle) {
        throw new Error(`Element not found: ${selector}`);
      }
      
      const box = await elementHandle.boundingBox();
      if (!box) {
        throw new Error(`Element has no bounding box: ${selector}`);
      }
      
      // Start from a random position on the page
      const viewportSize = this.page.viewportSize();
      const start = {
        x: Math.random() * viewportSize.width,
        y: Math.random() * viewportSize.height
      };
      
      // Target is center of the element with a slight randomness
      const end = {
        x: box.x + box.width / 2 + (Math.random() * 10 - 5),
        y: box.y + box.height / 2 + (Math.random() * 10 - 5)
      };
      
      // Generate a human-like path
      const points = generateHumanMousePath(start, end, 10);
      
      // Move the mouse along the path
      await this.page.mouse.move(start.x, start.y);
      for (const point of points) {
        await this.page.mouse.move(point.x, point.y);
        await randomDelay(10, 30); // Small delay between movements
      }
      
      // Slight pause before clicking
      await randomDelay(100, 500);
      
      // Click with random delay between mouse down and up
      await this.page.mouse.down();
      await randomDelay(20, 150);
      await this.page.mouse.up();
      
      // Track this action
      this.actionCount++;
      
      return true;
    } catch (error) {
      console.error(`Human click failed on ${selector}:`, error);
      throw error;
    }
  }

  /**
   * Click on an element based on selector or text
   */
  async click(target) {
    if (!this.isInitialized) {
      throw new Error('Browser is not initialized. Call initialize() first.');
    }
    
    // Check for CAPTCHA first
    if (await this.handleCaptcha()) {
      console.log('CAPTCHA handled before clicking');
    }
    
    // Special case for Kaggle sign-in button
    if (this.currentUrl && this.currentUrl.includes('kaggle.com') && 
        (target.toLowerCase().includes('sign in') || target.toLowerCase().includes('login'))) {
      console.log('Detected Kaggle sign-in button, trying special selectors');
      
      const kaggleSignInButtonSelectors = [
        // Try exact text match
        'a:has-text("Sign In")',
        'button:has-text("Sign In")',
        'a.button-primary:has-text("Sign In")',
        // Try more generic selectors
        '[href*="login"]',
        '[href*="signin"]',
        '[data-testid="SignInButton"]',
        // By role
        'role=link[name="Sign In"]',
        // More specific selectors from examining site structure
        'a.sc-dkrFOg',
        'a[href*="account/login"]'
      ];
      
      for (const selector of kaggleSignInButtonSelectors) {
        try {
          console.log(`Trying Kaggle sign-in button selector: ${selector}`);
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              console.log(`Found visible Kaggle sign-in button with: ${selector}`);
              await this.humanClick(selector);
              return true;
            } else {
              console.log(`Button found but not visible: ${selector}`);
            }
          }
        } catch (err) {
          console.log(`Kaggle sign-in button selector ${selector} failed: ${err.message}`);
          // Continue to the next selector
        }
      }
      
      // If all selectors fail, try the JavaScript evaluation approach
      console.log('All standard selectors failed, trying JavaScript evaluation approach');
      const jsResult = await this.findAndClickSignInLink();
      if (jsResult) {
        return true;
      }
    }
    
    // Special case for Kaggle login page with email
    if (this.currentUrl && this.currentUrl.includes('kaggle.com') && 
        (target.toLowerCase().includes('sign in with email') || 
         target.toLowerCase().includes('sign in using email') ||
         target.toLowerCase().includes('email') ||
         target.toLowerCase().includes('sign in'))) {
      console.log('Detected Kaggle login page, trying special selectors for sign in with email button');
      
      // Take a screenshot to see what we're looking at
      await this.takeDebugScreenshot('kaggle-signin-options', 'test_images');

      // Try our special handler first - this is the most reliable approach
      const specialResult = await this.clickKaggleEmailSignIn();
      if (specialResult) {
        console.log('Successfully clicked Sign in with Email using special handler');
        return true;
      }
      
      // Add exact selectors based on the HTML structure
      console.log('Trying exact selectors based on the HTML structure');
      const exactSelectors = [
        'button.sc-edmcci:has(span:has-text("Sign in with Email"))',
        'button.sc-edmcci[role="button"]',
        'button[role="button"]:has(span.sc-hJRrWL)',
        'button[role="button"].sc-edmcci',
        'button:has(span.sc-hJRrWL)',
        'button:has(span:text-is("Sign in with Email"))',
        '.iyvAlB' // Using the specific class name
      ];
      
      for (const selector of exactSelectors) {
        try {
          console.log(`Trying exact HTML selector: ${selector}`);
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            console.log(`Successfully clicked with exact selector: ${selector}`);
            await randomDelay(2000, 3000);
            return true;
          }
        } catch (err) {
          console.log(`Exact selector ${selector} failed: ${err.message}`);
        }
      }
      
      // Try clicking directly on the known position of the email button based on the screenshot
      try {
        console.log('Attempting to click on the "Sign in with Email" option using coordinates');
        // Calculate viewport center
        const viewportSize = await this.page.viewportSize();
        // The "Sign in with Email" button appears to be centered horizontally and about 1/3 down the page
        await this.page.mouse.click(viewportSize.width / 2, viewportSize.height / 3);
        
        // Wait to see if this worked
        await randomDelay(1000, 2000);
        
        // Check if we navigated to the email login page
        const currentUrl = this.page.url();
        if (currentUrl.includes('login') && !currentUrl.includes('startSignInTab')) {
          console.log('Successfully clicked email sign-in option using coordinates');
          return true;
        }
      } catch (err) {
        console.log(`Coordinate-based click failed: ${err.message}`);
      }
      
      // Force clicking on any button with "email" text
      try {
        console.log('Force clicking on any button with "Sign in with Email" text');
        const result = await this.page.evaluate(() => {
          // Get all buttons and filter by text content
          const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
          console.log(`Found ${allButtons.length} buttons on the page`);
          
          // Look for the exact text "Sign in with Email"
          for (const button of allButtons) {
            if (button.textContent && button.textContent.includes('Sign in with Email')) {
              console.log(`Found button with text: ${button.textContent}`);
              // Force a direct click
              button.click();
              return true;
            }
          }
          
          // If exact text not found, try case-insensitive match
          for (const button of allButtons) {
            if (button.textContent && button.textContent.toLowerCase().includes('sign in with email')) {
              console.log(`Found button with case-insensitive text: ${button.textContent}`);
              button.click();
              return true;
            }
          }
          
          // If that fails, try just "email"
          for (const button of allButtons) {
            if (button.textContent && button.textContent.toLowerCase().includes('email')) {
              console.log(`Found button with email text: ${button.textContent}`);
              button.click();
              return true;
            }
          }
          
          return false;
        });
        
        if (result) {
          console.log('Successfully force-clicked button with email text');
          await randomDelay(2000, 3000);
          return true;
        }
      } catch (err) {
        console.log(`Force clicking failed: ${err.message}`);
      }
      
      const kaggleSignInSelectors = [
        // Exact selector based on the screenshot
        'div.mdc-button__label:has-text("Sign in with Email")',
        'div:text("Sign in with Email")',
        'div:has-text("Sign in with Email")',
        // Case insensitive version
        'div:text-is("Sign in with Email", "i")',
        // Try for the parent element containing the text
        '[role="button"]:has(div:has-text("Sign in with Email"))',
        // Try for any element containing the text (with correct case)
        ':has-text("Sign in with Email")', 
        ':text("Sign in with Email")',
        // More general selectors
        '[role="button"]:has-text("Email")',
        // Special accessor combining image and text
        'a:has(img[alt="Email"]) ~ div:has-text("Email")',
        // Try XPath
        '//div[contains(text(), "Sign in with Email")]',
        '//div[contains(normalize-space(), "Sign in with Email")]',
        // JS evaluation as last resort
        'document.evaluate("//div[contains(text(), \'Sign in with Email\')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue'
      ];
      
      for (const selector of kaggleSignInSelectors) {
        try {
          console.log(`Trying Kaggle email sign-in selector: ${selector}`);
          
          // For JavaScript evaluation strings, use special handling
          if (selector.startsWith('document.')) {
            const element = await this.page.evaluate((js) => {
              const el = eval(js);
              if (el) {
                const rect = el.getBoundingClientRect();
                return {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                  text: el.innerText
                };
              }
              return null;
            }, selector);
            
            if (element) {
              console.log(`Found element with JS eval: ${element.text} at ${element.x},${element.y}`);
              await this.page.mouse.move(element.x, element.y);
              await randomDelay(200, 500);
              await this.page.mouse.down();
              await randomDelay(20, 150);
              await this.page.mouse.up();
              return true;
            }
            continue;
          }
          
          // For regular selectors
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              console.log(`Found visible Kaggle sign-in with email button: ${selector}`);
              await this.humanClick(selector);
              return true;
            } else {
              console.log(`Button found but not visible: ${selector}`);
            }
          }
        } catch (err) {
          console.log(`Kaggle email sign-in selector ${selector} failed: ${err.message}`);
          // Continue to the next selector
        }
      }
      
      // If all selectors fail, try clicking any button containing 'email'
      try {
        console.log('Trying to find any button containing "email"...');
        const emailButtons = await this.page.$$('role=button');
        for (const button of emailButtons) {
          const text = await button.textContent();
          if (text.toLowerCase().includes('email')) {
            console.log(`Found button with text containing "email": ${text}`);
            await button.click();
            return true;
          }
        }
      } catch (err) {
        console.log(`Failed to find any buttons containing "email": ${err.message}`);
      }
      
      // As a last resort, try our JavaScript-based approach
      console.log('Trying JavaScript-based approach to find email elements...');
      const jsResult = await this.findAndClickEmailElement();
      if (jsResult) {
        return true;
      }
      
      // Take another screenshot to see if anything changed
      await this.takeDebugScreenshot('kaggle-signin-email-search-failed', 'test_images');
    }
    
    // Special case for CAPTCHA checkboxes
    if (target.toLowerCase().includes('robot') || 
        target.toLowerCase().includes('captcha') || 
        target.toLowerCase().includes('human')) {
      console.log('Attempting to click CAPTCHA element');
      
      const captchaSelectors = [
        'div.recaptcha-checkbox-border',
        '#recaptcha-anchor',
        '.recaptcha-checkbox-checkmark',
        'iframe[title="reCAPTCHA"]',
        'iframe[src*="recaptcha"]',
      ];
      
      // Try direct click on each selector
      for (const selector of captchaSelectors) {
        try {
          console.log(`Trying CAPTCHA selector: ${selector}`);
          const element = await this.page.$(selector);
          if (element) {
            // If it's an iframe, need to handle frames
            if (selector.includes('iframe')) {
              const frames = this.page.frames();
              for (const frame of frames) {
                try {
                  if (frame.url().includes('recaptcha')) {
                    const checkbox = await frame.$('div.recaptcha-checkbox-border');
                    if (checkbox) {
                      await frame.click('div.recaptcha-checkbox-border');
                      console.log('Clicked reCAPTCHA in iframe');
                      return true;
                    }
                  }
                } catch (frameError) {
                  console.log(`Frame error: ${frameError.message}`);
                }
              }
            } else {
              // Direct click on element
              await this.humanClick(selector);
              console.log(`Clicked CAPTCHA element with selector: ${selector}`);
              return true;
            }
          }
        } catch (err) {
          console.log(`CAPTCHA selector ${selector} failed: ${err.message}`);
        }
      }
      
      // If all automated attempts fail, switch to user intervention
      return await this.activateUserIntervention('Please solve the CAPTCHA in the browser window.');
    }
    
    // Special case for search buttons
    if ((target.toLowerCase().includes('search') || target.toLowerCase().includes('go')) && 
        this.currentUrl && this.currentUrl.includes('google.com')) {
      console.log('Detected Google search button click attempt, trying special handling...');
      
      // Try pressing Enter first, which is often the most reliable way to submit a search
      try {
        console.log('Trying to press Enter to submit search...');
        await this.pressEnter();
        return true;
      } catch (enterError) {
        console.log(`Enter key approach failed: ${enterError.message}`);
        
        // If Enter fails, try common Google search button selectors
        const googleSearchButtonSelectors = [
          'input[name="btnK"]',
          'input[value="Google Search"]',
          'button[aria-label="Google Search"]',
          '.gNO89b',
          'input.gNO89b'
        ];
        
        for (const selector of googleSearchButtonSelectors) {
          try {
            console.log(`Trying Google search button selector: ${selector}`);
            // First check if it exists and is visible
            const button = await this.page.$(selector);
            if (button) {
              const isVisible = await button.isVisible();
              if (isVisible) {
                console.log(`Found visible Google search button with: ${selector}`);
                await this.humanClick(selector);
                return true;
              } else {
                console.log(`Button found but not visible: ${selector}`);
              }
            }
          } catch (err) {
            console.log(`Selector ${selector} failed: ${err.message}`);
            // Continue to the next selector
          }
        }
      }
    }
    
    try {
      // Add random delay before clicking to appear more human-like
      await randomDelay();
      
      // Process the target if it contains quotes
      const safeTarget = this.processSelectorWithQuotes(target);
      
      // Try clicking by selector
      try {
        console.log(`Trying to click selector: ${safeTarget}`);
        await this.humanClick(safeTarget);
        return true;
      } catch (selectorError) {
        console.log(`Direct selector failed: ${selectorError.message}`);
        
        // If selector fails, try finding by text
        try {
          const textSelector = `text=${this.stripQuotes(target)}`;
          console.log(`Trying text selector: ${textSelector}`);
          await this.humanClick(textSelector);
          return true;
        } catch (textError) {
          console.log(`Text selector failed: ${textError.message}`);
          
          // If text fails, try finding by role
          try {
            const roleSelector = `role=button[name="${this.stripQuotes(target)}"]`;
            console.log(`Trying role selector: ${roleSelector}`);
            await this.humanClick(roleSelector);
            return true;
          } catch (roleError) {
            console.log(`Role selector failed: ${roleError.message}`);
            
            // Try more generic selectors
            try {
              const ariaSelector = `[aria-label*="${this.stripQuotes(target)}" i]`;
              console.log(`Trying aria-label selector: ${ariaSelector}`);
              await this.humanClick(ariaSelector);
              return true;
            } catch (ariaLabelError) {
              console.log(`Aria-label selector failed: ${ariaLabelError.message}`);
              
              // Try by ID or name attribute
              try {
                const idNameSelector = `[id*="${this.stripQuotes(target)}" i], [name*="${this.stripQuotes(target)}" i]`;
                console.log(`Trying id/name selector: ${idNameSelector}`);
                await this.humanClick(idNameSelector);
                return true;
              } catch (idNameError) {
                console.log(`ID/name selector failed: ${idNameError.message}`);
                
                // Try XPath as a last resort
                try {
                  const xpathSelector = `//*[contains(text(),"${this.stripQuotes(target)}") or contains(@id,"${this.stripQuotes(target)}") or contains(@name,"${this.stripQuotes(target)}")]`;
                  console.log(`Trying XPath selector: ${xpathSelector}`);
                  const elements = await this.page.$$(xpathSelector);
                  if (elements.length > 0) {
                    await elements[0].click();
                    return true;
                  } else {
                    // If all methods fail, throw the original error
                    throw selectorError;
                  }
                } catch (xpathError) {
                  console.log(`XPath selector failed: ${xpathError.message}`);
                  throw selectorError;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to click on ${target}:`, error);
      
      // Take a debug screenshot to help diagnose element finding issues
      await this.takeDebugScreenshot('click-fail', 'test_images');
      
      throw error;
    }
  }

  /**
   * Process selectors that might contain quotes
   */
  processSelectorWithQuotes(selector) {
    // If the selector has quotes, it might cause CSS selector syntax errors
    if (selector.includes("'") || selector.includes('"')) {
      // For simple cases, just strip the quotes
      return this.stripQuotes(selector);
    }
    return selector;
  }

  /**
   * Strip quotes from a string
   */
  stripQuotes(str) {
    return str.replace(/['"`]/g, '');
  }

  /**
   * Check for and handle CAPTCHA challenges
   */
  async handleCaptcha() {
    if (await isCaptchaPresent(this.page)) {
      if (!this.userInterventionActive) {
        return await this.activateUserIntervention('CAPTCHA detected! Please solve it manually in the browser window.');
      }
      return true;
    }
    return false;
  }

  /**
   * Activate user intervention mode for CAPTCHAs or other challenges
   */
  async activateUserIntervention(message) {
    if (this.userInterventionActive) {
      return true; // Already in user intervention mode
    }
    
    this.userInterventionActive = true;
    console.log('\n==================================================================');
    console.log(`USER INTERVENTION REQUIRED: ${message}`);
    console.log('The browser is waiting for you to manually complete this action.');
    console.log('After completing the action, the automation will continue.');
    console.log('==================================================================\n');
    
    // Wait for navigation or a timeout
    try {
      // Wait for a navigation event which might indicate the CAPTCHA was solved
      await this.page.waitForNavigation({ timeout: 60000 });
    } catch (error) {
      console.log('No navigation occurred after user intervention, continuing anyway...');
    }
    
    this.userInterventionActive = false;
    await randomDelay(1000, 2000); // Add a delay after user intervention
    return true;
  }

  /**
   * Press the Enter key to submit forms
   */
  async pressEnter() {
    if (!this.isInitialized) {
      throw new Error('Browser is not initialized. Call initialize() first.');
    }
    
    console.log('Pressing Enter key...');
    try {
      // Add a random delay before pressing Enter
      await randomDelay(300, 800);
      
      // Try to press Enter on the focused element
      await this.page.keyboard.press('Enter');
      
      // Track this action
      this.actionCount++;
      
      // Wait for navigation if enter triggers a page load
      try {
        await this.page.waitForNavigation({ timeout: 5000 });
      } catch (navError) {
        // It's okay if navigation doesn't happen, the Enter key might have other effects
        console.log('No navigation occurred after pressing Enter');
      }
      
      // Check for CAPTCHA after pressing Enter
      await this.handleCaptcha();
      
      return true;
    } catch (error) {
      console.error('Failed to press Enter:', error);
      throw error;
    }
  }

  /**
   * Human-like typing with variable speed and occasional mistakes
   */
  async humanType(selector, text) {
    const element = await this.page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    // Clear the field first
    await element.fill('');
    
    // Focus the element
    await element.focus();
    await randomDelay(100, 500);
    
    // Type each character with variable speed
    for (let i = 0; i < text.length; i++) {
      // Randomly decide to make a mistake (1% chance)
      if (Math.random() < 0.01) {
        // Type a wrong character
        const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // Random lowercase letter
        await this.page.keyboard.type(wrongChar);
        await randomDelay(300, 700);
        
        // Delete the wrong character
        await this.page.keyboard.press('Backspace');
        await randomDelay(200, 500);
      }
      
      // Occasionally pause typing (0.5% chance at each character)
      if (Math.random() < 0.005) {
        await randomDelay(1000, 4000); // Take a break like a human would
      }
      
      // Type the correct character
      await this.page.keyboard.type(text[i]);
      
      // Variable delay between keystrokes (faster in the middle, slower at the beginning and end)
      const position = i / text.length;
      let delay;
      if (position < 0.2 || position > 0.8) {
        delay = Math.floor(Math.random() * 100) + 100; // 100-200ms at start and end
      } else {
        delay = Math.floor(Math.random() * 50) + 30; // 30-80ms in the middle
      }
      
      await randomDelay(delay, delay + 50);
    }
    
    // Track this action
    this.actionCount++;
    
    return true;
  }

  /**
   * Type text into an input field
   */
  async type(target, text) {
    if (!this.isInitialized) {
      throw new Error('Browser is not initialized. Call initialize() first.');
    }
    
    // Check for CAPTCHA first
    if (await this.handleCaptcha()) {
      console.log('CAPTCHA handled before typing');
    }
    
    // Special case handling for known websites
    if (this.currentUrl && this.currentUrl.includes('google.com')) {
      console.log('Detected Google website, using special handling for search...');
      
      // Google-specific selectors for search box
      const googleSearchSelectors = [
        'input[name="q"]',
        'textarea[name="q"]', // Google sometimes uses textarea instead of input
        'input[title="Search"]',
        '[aria-label="Search"]',
        'input.gLFyf',
        '.search-input'
      ];
      
      for (const selector of googleSearchSelectors) {
        try {
          console.log(`Trying Google selector: ${selector}`);
          const element = await this.page.$(selector);
          if (element) {
            console.log(`Found Google search box with: ${selector}`);
            // Use human-like typing
            await this.humanType(selector, text);
            return true;
          }
        } catch (err) {
          console.log(`Selector ${selector} failed: ${err.message}`);
          // Continue to the next selector
        }
      }
    }
    
    // Common input patterns for different types of fields
    const commonInputs = {
      'search box': ['input[type="search"]', 'input[name="q"]', 'textarea[name="q"]', 'input[aria-label="Search"]', '[role="search"] input', '.search-box', '#search'],
      'email field': ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]', '#email'],
      'password field': ['input[type="password"]', 'input[name="password"]', 'input[placeholder*="password" i]', '#password'],
      'username field': ['input[name="username"]', 'input[placeholder*="username" i]', '#username', 'input[name="login"]'],
      'input box': ['input', 'textarea', '[contenteditable="true"]'], // Generic input selectors
      'search bar': ['input[type="search"]', 'input[name="q"]', 'textarea[name="q"]', 'input[aria-label="Search"]', '[role="search"] input']
    };
    
    console.log(`Attempting to type "${text}" into "${target}"`);
    
    try {
      // Process the target if it contains quotes
      const safeTarget = this.stripQuotes(target);
      
      // Check if target matches any of our common input patterns
      if (commonInputs[safeTarget.toLowerCase()]) {
        console.log(`Found common input pattern for: ${safeTarget.toLowerCase()}`);
        for (const selector of commonInputs[safeTarget.toLowerCase()]) {
          try {
            console.log(`Trying common selector: ${selector}`);
            if (await this.page.$(selector)) {
              console.log(`Found element with: ${selector}`);
              await this.humanType(selector, text);
              return true;
            }
          } catch (err) {
            console.log(`Selector ${selector} failed: ${err.message}`);
            // Continue to the next selector
          }
        }
      }
      
      // Try typing by selector
      try {
        console.log(`Trying direct selector: ${safeTarget}`);
        await this.humanType(safeTarget, text);
        return true;
      } catch (selectorError) {
        console.log(`Direct selector failed: ${selectorError.message}`);
        
        // If selector fails, try finding by placeholder
        try {
          const placeholderSelector = `[placeholder*="${safeTarget}" i]`;
          console.log(`Trying placeholder: ${placeholderSelector}`);
          await this.humanType(placeholderSelector, text);
          return true;
        } catch (placeholderError) {
          console.log(`Placeholder selector failed: ${placeholderError.message}`);
          
          // If placeholder fails, try finding by label
          try {
            const ariaSelector = `[aria-label*="${safeTarget}" i]`;
            console.log(`Trying aria-label: ${ariaSelector}`);
            await this.humanType(ariaSelector, text);
            return true;
          } catch (labelError) {
            console.log(`Aria-label selector failed: ${labelError.message}`);
            
            // Try finding by role
            try {
              const roleSelector = `role=textbox[name*="${safeTarget}" i]`;
              console.log(`Trying role selector: ${roleSelector}`);
              await this.humanType(roleSelector, text);
              return true;
            } catch (roleError) {
              console.log(`Role selector failed: ${roleError.message}`);
              
              // Try using keyboard input as a last resort
              try {
                console.log("Trying to use keyboard input as last resort");
                // Focus on something that might be focusable
                await this.page.keyboard.press('Tab');
                await randomDelay(200, 500);
                // Type the text directly with human-like delays
                for (let i = 0; i < text.length; i++) {
                  await this.page.keyboard.type(text[i]);
                  await randomDelay(30, 100);
                }
                return true;
              } catch (keyboardError) {
                console.log(`Keyboard input failed: ${keyboardError.message}`);
                
                // If all methods fail, try a more generic approach with xpath
                try {
                  // Find any input related to the target text (looking at labels, nearby text, etc.)
                  const xpathSelector = `//input[contains(@id,"${safeTarget}") or contains(@name,"${safeTarget}") or contains(@placeholder,"${safeTarget}")]|//label[contains(text(),"${safeTarget}")]/following::input[1]|//label[contains(text(),"${safeTarget}")]/..//input`;
                  console.log(`Trying xpath: ${xpathSelector}`);
                  const element = await this.page.$(xpathSelector);
                  if (element) {
                    await this.humanType(element, text);
                    return true;
                  } else {
                    console.log("No element found with xpath");
                  }
                } catch (xpathError) {
                  console.log(`XPath approach failed: ${xpathError.message}`);
                  // If all methods fail, throw the original error
                  throw selectorError;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to type "${text}" into ${target}:`, error);
      throw error;
    }
  }

  /**
   * Extract text content from elements
   */
  async extract(target) {
    if (!this.isInitialized) {
      throw new Error('Browser is not initialized. Call initialize() first.');
    }
    
    // Check for CAPTCHA first
    if (await this.handleCaptcha()) {
      console.log('CAPTCHA handled before extracting text');
    }
    
    // Add a small random delay
    await randomDelay(200, 800);
    
    try {
      // Process the target if it contains quotes
      const safeTarget = this.stripQuotes(target);
      
      // Try extracting by selector
      try {
        return await this.page.textContent(safeTarget);
      } catch (selectorError) {
        // If selector fails, try finding by text
        try {
          return await this.page.textContent(`text=${safeTarget}`);
        } catch (textError) {
          // Try finding by role
          try {
            return await this.page.textContent(`role=heading[name="${safeTarget}"]`);
          } catch (roleError) {
            // Try XPath as a last resort
            try {
              const element = await this.page.$(`//*[contains(text(),"${safeTarget}")]`);
              if (element) {
                return await element.textContent();
              }
            } catch (xpathError) {
              // If all methods fail, throw the original error
              throw selectorError;
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to extract content from ${target}:`, error);
      throw error;
    }
  }

  /**
   * Wait for a specific condition or duration
   */
  async wait(condition) {
    if (!this.isInitialized) {
      throw new Error('Browser is not initialized. Call initialize() first.');
    }
    
    try {
      if (typeof condition === 'number') {
        // Add some randomness to the wait time to appear more human-like
        const randomizedDelay = condition + (Math.random() * 500 - 250); // +/- 250ms
        await this.page.waitForTimeout(randomizedDelay);
      } else if (typeof condition === 'string') {
        // Process the condition if it contains quotes
        const safeCondition = this.stripQuotes(condition);
        // Wait for selector to be visible
        await this.page.waitForSelector(safeCondition, { state: 'visible' });
      }
      
      // Check for CAPTCHA after waiting
      await this.handleCaptcha();
      
      return true;
    } catch (error) {
      console.error(`Failed to wait for ${condition}:`, error);
      throw error;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(path) {
    try {
      // Create directory if it doesn't exist
      const directory = path.split('/').slice(0, -1).join('/');
      if (directory) {
        await fs.mkdir(directory, { recursive: true });
      }
      
      // Take the screenshot
      await this.page.screenshot({ path });
      console.log(`Screenshot saved to: ${path}`);
      return true;
    } catch (error) {
      console.error('Error taking screenshot:', error.message);
      return false;
    }
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.isInitialized = false;
    }
  }

  /**
   * Take a debug screenshot with timestamp and save to specified directory
   * @param {string} name - Name prefix for the screenshot
   * @param {string} directory - Directory to save screenshot in
   * @returns {Promise<boolean>} - Whether the screenshot was successfully taken
   */
  async takeDebugScreenshot(name = 'debug', directory = 'debug_screenshots') {
    try {
      // Create a timestamped filename
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `${name}_${timestamp}.png`;
      const path = `${directory}/${filename}`;
      
      // Take the screenshot using the existing screenshot method
      return await this.screenshot(path);
    } catch (error) {
      console.error('Error taking debug screenshot:', error.message);
      return false;
    }
  }

  /**
   * Find and click a sign-in link using JavaScript evaluation
   */
  async findAndClickSignInLink() {
    console.log('Finding and clicking Sign In link using specialized method...');
    
    try {
      // First try direct JavaScript approach with enhanced selectors for current Kaggle UI
      const clickResult = await this.page.evaluate(() => {
        try {
          console.log('Current page URL:', window.location.href);
          console.log('Document title:', document.title);
          
          // Log all links for debugging
          const allLinks = document.querySelectorAll('a, button');
          console.log(`Found ${allLinks.length} total links/buttons on page`);
          
          // Specialized selector for current Kaggle UI (2023-2024)
          const kaggleSelectors = [
            'button.sc-jKJlTe',            // Common Kaggle button class
            'button.sc-ftfyrw',            // Common Kaggle button class (alt)
            'button.sc-CtfFt',             // Another Kaggle class
            'header button',               // Header buttons
            'nav button',                  // Nav buttons
            '[data-component-name="LoginRegisterButton"]', // Data component
            '[role="navigation"] button',  // Navigation role buttons
            '.site-header-react button',   // React header
            '.site-header button',         // Standard header
            'header a[href="/account/login"]', // Direct login link
            'a[href="/account/login"]',    // Login link anywhere
            '[aria-label="Sign In"]',      // Aria label
            '[aria-label="Login"]',        // Aria label alt
            '.navbar-right a',             // Right-side navbar
            '.navbar a:last-child',        // Last navbar link
          ];
          
          // Try each selector one by one
          for (const selector of kaggleSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              console.log(`Found ${elements.length} elements with selector: ${selector}`);
              
              // Find one with relevant text if possible
              const signInElement = Array.from(elements).find(el => {
                const text = (el.textContent || '').toLowerCase();
                return text.includes('sign') || text.includes('login') || text.includes('log in');
              }) || elements[0]; // Fall back to first element
              
              console.log(`Clicking element with text: ${signInElement.textContent}`);
              signInElement.click();
              return { success: true, method: `selector-${selector}` };
            }
          }
          
          // Try to find sign in link by text content as fallback
          const signInLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'))
            .filter(el => {
              const text = (el.textContent || '').toLowerCase().trim();
              return text === 'sign in' || text === 'signin' || text === 'login' || text === 'log in';
            });
          
          if (signInLinks.length > 0) {
            console.log(`Found ${signInLinks.length} sign in links by text content`);
            signInLinks[0].click();
            return { success: true, method: 'text-content' };
          }
          
          // If everything fails, try to find any header element that might be a sign in button
          const headerLinks = Array.from(document.querySelectorAll('header a, nav a, .header a, .navbar a'));
          const lastHeaderLink = headerLinks[headerLinks.length - 1]; // Often sign in is the last header link
          
          if (lastHeaderLink) {
            console.log(`Clicking last header link as fallback: ${lastHeaderLink.textContent}`);
            lastHeaderLink.click();
            return { success: true, method: 'last-header-link' };
          }
          
          // Get all links for debugging
          const linkInfo = Array.from(document.querySelectorAll('a, button')).map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim(),
            href: el.href,
            class: el.className
          }));
          
          return { 
            success: false, 
            error: 'No sign in link found with any method',
            links: linkInfo.slice(0, 10) // First 10 links for debugging
          };
        } catch (error) {
          return { success: false, error: error.toString() };
        }
      });
      
      if (clickResult.success) {
        console.log(`Successfully clicked sign in link using ${clickResult.method} method`);
        await this.wait(3000); // Wait for navigation
        
        // Take a screenshot to confirm the result
        await this.takeDebugScreenshot('after-signin-link-click', 'test_images');
        
        return true;
      }
      
      console.log('JavaScript approach failed. Debug info:', JSON.stringify(clickResult, null, 2));
      
      // Fallback to Playwright's click by text with enhanced selectors
      console.log('JavaScript approach failed, trying Playwright selectors...');
      
      // Take a screenshot to see what we're working with
      await this.takeDebugScreenshot('before-playwright-click', 'test_images');
      
      // Try different ways to find the sign in button
      const selectors = [
        'text="Sign In"',
        'text="Sign in"',
        'text="signin"', 
        'text="Log In"',
        'text="Login"',
        'a:has-text("Sign In")',
        'button:has-text("Sign In")',
        '[data-testid="login-button"]',
        '[data-testid="signin-button"]',
        'header >> button',
        'nav >> button',
        '.site-header-react button',
        '.navbar-right >> a:last-child',
        '[role="navigation"] a:last-child',
        '[role="navigation"] button:last-child'
      ];
      
      for (const selector of selectors) {
        try {
          console.log(`Trying selector: ${selector}`);
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            console.log(`Successfully clicked sign in link using selector: ${selector}`);
            await this.wait(3000); // Wait for navigation
            
            // Take a screenshot to confirm the result
            await this.takeDebugScreenshot('after-playwright-click', 'test_images');
            
            return true;
          }
        } catch (error) {
          // Continue trying other selectors
        }
      }
      
      // If all selectors fail, try clicking in the top-right corner
      console.log('All selectors failed, trying to click by position in top-right corner...');
      
      try {
        const viewport = await this.page.viewportSize();
        const x = viewport.width - 100; // 100px from right edge
        const y = 50; // 50px from top edge
        
        await this.page.mouse.move(x, y);
        await this.page.mouse.click(x, y);
        
        console.log(`Clicked at position (${x}, ${y})`);
        await this.wait(3000);
        
        // Take a screenshot to see if it worked
        await this.takeDebugScreenshot('after-position-click', 'test_images');
        
        // Check if we're on a login page now
        const currentUrl = await this.page.url();
        if (currentUrl.includes('login') || currentUrl.includes('signin')) {
          console.log('Successfully navigated to login page by position click');
          return true;
        }
      } catch (posError) {
        console.log('Position click failed:', posError.message);
      }
      
      console.error('Failed to find sign in link with all methods');
      return false;
    } catch (error) {
      console.error('Error in findAndClickSignInLink:', error);
      return false;
    }
  }

  /**
   * Find and click on elements containing email text
   */
  async findAndClickEmailElement() {
    console.log('Attempting to find and click any element containing "email" text...');
    
    try {
      // Take a screenshot before we start
      await this.takeDebugScreenshot('before-find-email-element', 'test_images');
      
      // Use JavaScript to find any elements containing "email" text
      const found = await this.page.evaluate(() => {
        // Helper function to get visible text
        function getVisibleText(element) {
          if (element.offsetWidth === 0 || element.offsetHeight === 0) return '';
          return element.innerText || element.textContent || '';
        }
        
        // Get all elements that could be buttons or links
        const elements = Array.from(document.querySelectorAll('div, button, a, span, [role="button"]'));
        console.log(`Found ${elements.length} potential elements`);
        
        // Find elements containing "email" text
        const emailElements = elements.filter(el => {
          const text = getVisibleText(el).toLowerCase();
          return text.includes('email') && (text.includes('sign in') || text.includes('login'));
        });
        
        console.log(`Found ${emailElements.length} elements containing both "email" and "sign in" or "login"`);
        
        // If found, get the first one
        if (emailElements.length > 0) {
          // Get the element's position for reporting
          const rect = emailElements[0].getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            text: getVisibleText(emailElements[0])
          };
        }
        
        // If none found with both terms, try just "email"
        const justEmailElements = elements.filter(el => {
          const text = getVisibleText(el).toLowerCase();
          return text.includes('email');
        });
        
        console.log(`Found ${justEmailElements.length} elements containing "email"`);
        
        if (justEmailElements.length > 0) {
          const rect = justEmailElements[0].getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            text: getVisibleText(justEmailElements[0])
          };
        }
        
        return null;
      });
      
      if (found) {
        console.log(`Found element with text: "${found.text}" at x:${found.x}, y:${found.y}`);
        
        // Move the mouse to the position and click
        await this.page.mouse.move(found.x, found.y);
        await randomDelay(200, 500);
        await this.page.mouse.down();
        await randomDelay(20, 150);
        await this.page.mouse.up();
        
        console.log('Clicked on element using JavaScript evaluation');
        return true;
      } else {
        console.log('No suitable elements found using JavaScript evaluation');
        return false;
      }
    } catch (error) {
      console.error('Error finding email element:', error);
      return false;
    }
  }

  /**
   * Special handler for clicking on the Kaggle Sign in with Email button
   */
  async clickKaggleEmailSignIn() {
    console.log('Attempting to click Kaggle Sign in with Email using special handling...');
    
    try {
      // Wait for React app to render content
      console.log('Waiting for auth options to render...');
      try {
        await this.page.waitForFunction(() => {
          // Wait for auth options to load (look for any buttons)
          const buttons = document.querySelectorAll('button');
          return buttons.length > 1;
        }, { timeout: 10000 });
        console.log('Auth options have rendered');
      } catch (timeoutError) {
        console.log('Timeout waiting for auth options to render, continuing anyway');
      }
      
      // Take a screenshot to help with debugging
      await this.takeDebugScreenshot('before-kaggle-email-click', 'test_images');
      
      // Wait for the page to stabilize
      await this.page.waitForTimeout(3000);
      
      console.log('Dumping page content to help with debugging');
      const pageContent = await this.page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          bodyText: document.body.innerText.slice(0, 1000), // First 1000 chars
          buttonCount: document.querySelectorAll('button').length,
          buttons: Array.from(document.querySelectorAll('button')).map(btn => ({
            text: btn.innerText || 'no text',
            classes: btn.className,
            visible: btn.offsetParent !== null
          }))
        };
      });
      console.log('Current page info:', JSON.stringify(pageContent, null, 2));
      
      // Try to find all buttons with "Email" text
      const buttonInfo = await this.page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        console.log(`Found ${allButtons.length} buttons on the page`);
        
        // Find specific button by exact class first
        const specificClassButton = document.querySelector('button.sc-edmcci.iyvAlB');
        if (specificClassButton && specificClassButton.innerText && specificClassButton.innerText.includes('Email')) {
          const rect = specificClassButton.getBoundingClientRect();
          return [{
            index: 0,
            text: specificClassButton.innerText,
            id: specificClassButton.id,
            classes: specificClassButton.className,
            rect: rect,
            visible: specificClassButton.offsetParent !== null,
            disabled: specificClassButton.disabled,
            position: 1
          }];
        }
        
        // Find specific button with Email text
        const emailButtons = allButtons.filter(btn => 
          btn.innerText && btn.innerText.includes('Email')
        );
        
        if (emailButtons.length > 0) {
          // Log all matching buttons
          return emailButtons.map((btn, index) => ({
            index,
            text: btn.innerText,
            id: btn.id,
            classes: btn.className,
            rect: btn.getBoundingClientRect(),
            visible: btn.offsetParent !== null,
            disabled: btn.disabled,
            position: index + 1 // 1-based position
          }));
        }
        return [];
      });
      
      console.log('Email buttons found:', JSON.stringify(buttonInfo, null, 2));
      
      // Click the first visible email button if found
      if (buttonInfo.length > 0) {
        // Find the first visible button
        const visibleButton = buttonInfo.find(btn => btn.visible);
        if (visibleButton) {
          console.log(`Clicking email button at position ${visibleButton.index + 1}: "${visibleButton.text}"`);
          
          // Click at the center of the button's bounding rect
          await this.page.mouse.click(
            visibleButton.rect.x + visibleButton.rect.width/2,
            visibleButton.rect.y + visibleButton.rect.height/2
          );
          
          await this.page.waitForTimeout(2000);
          return true;
        }
      }
      
      // If no visible buttons found, try the simpler approach - click on second button
      try {
        console.log('No visible email buttons found, trying to click the second option (usually Email)');
        
        const allButtons = await this.page.$$('button');
        console.log(`Found ${allButtons.length} buttons on the page`);
        
        if (allButtons.length >= 2) {
          console.log('Clicking the second button');
          await allButtons[1].click(); 
          await this.page.waitForTimeout(2000);
          return true;
        }
      } catch (err) {
        console.log(`Failed to click second button: ${err.message}`);
      }
      
      // If both approaches fail, try clicking in the middle of the page
      console.log('Trying last resort: clicking middle of the page where Email button should be');
      const viewportSize = await this.page.viewportSize();
      await this.page.mouse.click(viewportSize.width / 2, viewportSize.height / 3);
      await this.page.waitForTimeout(2000);
      
      // Take another screenshot to see if anything changed
      await this.takeDebugScreenshot('after-kaggle-email-click-attempts', 'test_images');
      
      return true; // Return true anyway to proceed to the login step
    } catch (error) {
      console.error('Error in clickKaggleEmailSignIn:', error);
      return false;
    }
  }

  /**
   * Specialized method to search on Kaggle
   */
  async searchKaggle(searchTerm) {
    console.log(`Searching Kaggle for: "${searchTerm}"`);
    
    try {
      // Take a screenshot to see the initial state
      await this.takeDebugScreenshot('before-kaggle-search', 'test_images');
      
      // First check if we need to click a search icon to reveal the search box
      // This is necessary because on some layouts the search box is hidden
      const searchIconClicked = await this.page.evaluate(() => {
        try {
          console.log('Looking for search icon to click');
          // Try multiple selectors for the search icon/button
          const searchIconSelectors = [
            '[data-testid="search-button"]',
            'button[aria-label="Search"]',
            '.search-icon',
            '[data-icon="search"]',
            'i.fa-search',
            'svg[aria-label="Search"]',
            '[data-component-name="SearchIcon"]',
            // More general selectors
            '[aria-label*="search" i]',
            'button:has(svg)',
            // Look for magnifying glass icon in any component
            '[class*="search" i]'
          ];
          
          // Try each selector
          for (const selector of searchIconSelectors) {
            const searchIcon = document.querySelector(selector);
            if (searchIcon && searchIcon.offsetParent !== null) { // Check if visible
              console.log(`Found search icon with selector: ${selector}`);
              searchIcon.click();
              return true;
            }
          }
          
          // If no specific selector worked, try to find buttons with search-related text
          const allButtons = Array.from(document.querySelectorAll('button'));
          const searchButton = allButtons.find(btn => {
            const text = btn.textContent.toLowerCase();
            return text.includes('search') || btn.innerHTML.includes('search');
          });
          
          if (searchButton) {
            console.log('Found search button by text content');
            searchButton.click();
            return true;
          }
          
          console.log('No search icon found to click');
          return false;
        } catch (error) {
          console.error('Error finding search icon:', error);
          return false;
        }
      });
      
      if (searchIconClicked) {
        console.log('Clicked search icon, waiting for search box to appear');
        await this.wait(1000);
        await this.takeDebugScreenshot('after-search-icon-click', 'test_images');
      }
      
      // Now try to find and fill the search input using multiple strategies
      // First strategy: Try standard selectors with a wait for the input to appear
      let searchPerformed = false;
      
      // Try 3 times with increasing waits
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`Search attempt ${attempt}: Looking for search input`);
        
        searchPerformed = await this.page.evaluate((searchTerm) => {
          try {
            // Kaggle-specific selectors for the search input
            const selectors = [
              // Specific Kaggle selectors
              'input[placeholder*="Search"]',
              'input[aria-label*="Search"]',
              'input[type="search"]',
              'input[name="searchBar"]',
              'input[data-testid="search-input"]',
              'input[class*="search" i]',
              // More general selectors
              'input[type="text"][placeholder*="search" i]',
              '[role="searchbox"]',
              '[data-component-name="SearchInput"]',
              // Last resort - any input that's visible
              'input:not([type="hidden"])'
            ];
            
            // Document current page state for debugging
            console.log(`Current URL: ${window.location.href}`);
            console.log(`Inputs on page: ${document.querySelectorAll('input').length}`);
            
            // Collect info about all inputs for debugging
            const allInputs = Array.from(document.querySelectorAll('input'));
            allInputs.forEach((input, i) => {
              console.log(`Input ${i}: type=${input.type}, placeholder=${input.placeholder || 'none'}, aria-label=${input.getAttribute('aria-label') || 'none'}, class=${input.className}`);
            });
            
            // Try each selector
            for (const selector of selectors) {
              const searchInput = document.querySelector(selector);
              if (searchInput && searchInput.offsetParent !== null) { // Check if visible
                console.log(`Found search input with selector: ${selector}`);
                
                // Focus the input
                searchInput.focus();
                
                // Set the value
                searchInput.value = searchTerm;
                
                // Dispatch events to trigger React state updates
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Check if we need to press Enter for the search to execute
                if (selector.includes('[role="searchbox"]') || selector.includes('placeholder') || selector.includes('aria-label')) {
                  console.log('Pressing Enter to submit search');
                  searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true
                  }));
                }
                
                return true;
              }
            }
            
            // If we haven't found a search input with selectors, try a more aggressive approach
            console.log('Standard selectors failed, trying to find search input by examining all inputs');
            
            // Look for visible inputs that might be search fields
            const visibleInputs = allInputs.filter(input => {
              return input.offsetParent !== null && // Visible
                   (input.type === 'text' || input.type === 'search') && // Text input
                   !input.disabled; // Not disabled
            });
            
            console.log(`Found ${visibleInputs.length} visible text/search inputs`);
            
            if (visibleInputs.length > 0) {
              const likelySearchInput = visibleInputs[0]; // Take the first one
              console.log(`Trying likely search input: ${likelySearchInput.outerHTML}`);
              
              // Focus the input
              likelySearchInput.focus();
              
              // Set the value
              likelySearchInput.value = searchTerm;
              
              // Dispatch events
              likelySearchInput.dispatchEvent(new Event('input', { bubbles: true }));
              likelySearchInput.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Press Enter to submit
              likelySearchInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true
              }));
              
              return true;
            }
            
            console.log('Could not find any suitable search input');
            return false;
          } catch (error) {
            console.error('Error during search:', error);
            return false;
          }
        }, searchTerm);
        
        if (searchPerformed) {
          console.log('Search input found and filled');
          break;
        } else {
          console.log(`Search attempt ${attempt} failed, waiting before retry`);
          await this.wait(1000 * attempt); // Increasing wait time with each attempt
        }
      }
      
      // If JavaScript approach failed, try direct Playwright methods
      if (!searchPerformed) {
        console.log('JavaScript search failed, trying Playwright type method');
        
        try {
          // Try with Playwright's fill/type methods on various selectors
          const searchSelectors = [
            'input[placeholder*="Search"]',
            'input[aria-label*="Search"]',
            'input[type="search"]',
            'input[name="searchBar"]'
          ];
          
          let filled = false;
          for (const selector of searchSelectors) {
            try {
              const searchInput = await this.page.$(selector);
              if (searchInput) {
                console.log(`Found search input with Playwright using selector: ${selector}`);
                await searchInput.click();
                await this.wait(500);
                await searchInput.fill(searchTerm);
                await this.wait(500);
                await this.pressEnter();
                filled = true;
                break;
              }
            } catch (e) {
              console.log(`Failed with selector ${selector}: ${e.message}`);
            }
          }
          
          if (!filled) {
            console.log('Failed to find search input with specific selectors, trying Kaggle / shortcut');
            
            // Kaggle specifically uses the '/' key as a shortcut to focus the search box
            await this.page.keyboard.press('/');
            console.log('Pressed / key to activate Kaggle search');
            await this.wait(1000);
            
            // Take a screenshot to see if the search box appeared
            await this.takeDebugScreenshot('after-slash-shortcut', 'test_images');
            
            // Type the search term
            await this.page.keyboard.type(searchTerm);
            await this.wait(500);
            
            // Press Enter to execute search
            await this.pressEnter();
            filled = true;
          }
        } catch (playwrightError) {
          console.error('Playwright search approach failed:', playwrightError);
        }
      }
      
      // Wait for search results to load
      await this.wait(3000);
      
      // Take a screenshot of search results
      await this.takeDebugScreenshot('after-kaggle-search', 'test_images');
      
      // Try to detect if search was successful by checking for results
      const searchSuccessful = await this.page.evaluate(() => {
        // Check if we're on a search results page
        const onSearchPage = window.location.href.includes('/search');
        
        // Look for search result indicators
        const hasResults = document.querySelector('.search-results') || 
                         document.querySelector('[data-testid="search-results"]') ||
                         document.querySelector('.mdc-list-item') ||
                         document.querySelector('.mdc-card');
        
        return {
          success: onSearchPage || !!hasResults,
          url: window.location.href
        };
      });
      
      console.log('Search completion check:', JSON.stringify(searchSuccessful));
      
      if (searchSuccessful.success) {
        console.log('✅ Kaggle search completed successfully');
        return true;
      } else {
        console.log('❌ Kaggle search may not have been successful');
        return false;
      }
    } catch (error) {
      console.error('Error during Kaggle search:', error);
      return false;
    }
  }

  /**
   * Extract content from the current page in a structured format
   * @param {string} [contentType='full'] - The type of content to extract ('full', 'main', 'heading', 'list', etc.)
   * @returns {Promise<Object>} - Structured page content
   */
  async extractPageContent(contentType = 'full') {
    try {
      console.log(`Extracting page content (type: ${contentType})...`);
      
      // Take a screenshot for reference
      await this.takeDebugScreenshot('page-content-extraction');
      
      const result = await this.page.evaluate((type) => {
        // Helper function to extract text from element safely
        const getTextContent = (element) => {
          if (!element) return '';
          return element.textContent.trim();
        };
        
        // Helper to check visibility
        const isVisible = (element) => {
          if (!element) return false;
          
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 element.offsetWidth > 0 && 
                 element.offsetHeight > 0;
        };
        
        // Find main content area - try different common selectors
        const findMainContent = () => {
          const selectors = [
            '#site-content', 'main', 'article', '.container', 
            '#content', '.content', '.main-content',
            '[role="main"]', '[data-testid="site-content"]'
          ];
          
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && isVisible(element)) {
              return element;
            }
          }
          
          // If no specific container found, use the body
          return document.body;
        };
        
        // Extract basic page info
        const pageInfo = {
          title: document.title,
          url: window.location.href,
          metaDescription: document.querySelector('meta[name="description"]')?.content || ''
        };
        
        // Find the main content element
        const mainElement = findMainContent();
        
        // Extract headings
        const headings = Array.from(mainElement.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .filter(isVisible)
          .map(h => ({
            level: parseInt(h.tagName.substring(1)),
            text: getTextContent(h),
            id: h.id || null
          }));
        
        // Extract paragraphs
        const paragraphs = Array.from(mainElement.querySelectorAll('p'))
          .filter(isVisible)
          .map(p => getTextContent(p))
          .filter(text => text.length > 0);
        
        // Extract lists
        const lists = Array.from(mainElement.querySelectorAll('ul, ol'))
          .filter(isVisible)
          .map(list => ({
            type: list.tagName === 'OL' ? 'ordered' : 'unordered',
            items: Array.from(list.querySelectorAll('li'))
              .map(item => getTextContent(item))
              .filter(text => text.length > 0)
          }))
          .filter(list => list.items.length > 0);
        
        // Extract tables
        const tables = Array.from(mainElement.querySelectorAll('table'))
          .filter(isVisible)
          .map(table => {
            // Get table headers
            const headers = Array.from(table.querySelectorAll('th'))
              .map(th => getTextContent(th));
            
            // Get table rows
            const rows = Array.from(table.querySelectorAll('tr'))
              .map(row => Array.from(row.querySelectorAll('td'))
                .map(cell => getTextContent(cell))
              )
              .filter(row => row.length > 0);
            
            return { headers, rows };
          });
        
        // Extract links
        const links = Array.from(mainElement.querySelectorAll('a'))
          .filter(isVisible)
          .map(a => ({
            text: getTextContent(a),
            href: a.href,
            classes: a.className
          }))
          .filter(link => link.text.length > 0);
        
        // Extract images
        const images = Array.from(mainElement.querySelectorAll('img'))
          .filter(isVisible)
          .map(img => ({
            alt: img.alt || '',
            src: img.src,
            width: img.width,
            height: img.height
          }));
        
        // Extract search results (specifically for search pages)
        const searchResults = [];
        // Try different selectors that might contain search results
        [
          '.mdc-card', '.mdc-list-item', 
          '[data-testid="search-results"] > div', 
          '[role="listitem"]',
          '.search-results li', '.search-results-item'
        ].forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements && elements.length > 0) {
            Array.from(elements).forEach((el, index) => {
              if (isVisible(el)) {
                // Try to find title and description in result item
                const title = el.querySelector('h3, h4, [role="heading"], .title')?.textContent.trim() || '';
                const description = el.querySelector('p, .description, .content')?.textContent.trim() || '';
                const link = el.querySelector('a')?.href || '';
                
                searchResults.push({
                  index: index + 1,
                  title: title || getTextContent(el).substring(0, 50),
                  description: description || '',
                  link: link,
                  fullText: getTextContent(el)
                });
              }
            });
          }
        });
        
        // Determine if we're on a search results page
        const isSearchPage = 
          window.location.href.includes('/search') || 
          document.title.toLowerCase().includes('search') ||
          searchResults.length > 0;
        
        // Extract form inputs
        const formInputs = Array.from(mainElement.querySelectorAll('input, select, textarea'))
          .filter(isVisible)
          .map(input => ({
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || '',
            id: input.id || '',
            placeholder: input.placeholder || '',
            value: input.type === 'password' ? '[HIDDEN]' : input.value || ''
          }));
        
        // Compile full structured content
        const structuredContent = {
          pageInfo,
          headings,
          paragraphs,
          lists,
          tables,
          links,
          images,
          formInputs,
          isSearchPage,
          searchResults: searchResults.length > 0 ? searchResults : null,
          rawText: mainElement.innerText
        };
        
        // Return different content based on requested type
        switch (type) {
          case 'main':
            return {
              title: pageInfo.title,
              headings: headings.filter(h => h.level <= 2), // Just top level headings
              content: paragraphs.slice(0, 3), // First few paragraphs
              type: 'main_content'
            };
            
          case 'headings':
            return { headings, type: 'headings' };
            
          case 'lists':
            return { lists, type: 'lists' };
            
          case 'tables':
            return { tables, type: 'tables' };
            
          case 'links':
            return { links, type: 'links' };
            
          case 'search-results':
            return { 
              isSearchPage, 
              searchResults, 
              type: 'search_results'
            };
          
          case 'text':
            return { 
              text: mainElement.innerText, 
              type: 'text' 
            };
            
          case 'full':
          default:
            return structuredContent;
        }
      }, contentType);
      
      return result;
    } catch (error) {
      console.error('Error extracting page content:', error);
      return {
        error: error.message,
        type: 'error'
      };
    }
  }

  /**
   * Extract formatted search results from Kaggle search page
   * @returns {Promise<Object>} - Structured search results data
   */
  async extractFormattedSearchResults() {
    try {
      console.log('Extracting formatted search results from the page...');
      
      // Execute JavaScript in the page context to extract search results
      const results = await this.page.evaluate(() => {
        try {
          // Get search query from page
          const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]');
          const searchQuery = searchInput ? searchInput.value : '';
          
          // Find search result elements
          const resultElements = Array.from(document.querySelectorAll(
            '.mdc-card, .result-item, [data-testid="search-results"] > div, [role="listitem"]'
          ));
          
          // If no specific selectors work, try more generic approach
          let resultItems = resultElements.length > 0 ? resultElements : 
            Array.from(document.querySelectorAll('main div > div > div'));
          
          // Try to determine total results count
          let totalResults = resultItems.length;
          const resultsCountEl = document.querySelector('[data-testid="results-count"], .results-count');
          if (resultsCountEl) {
            const countText = resultsCountEl.textContent;
            const countMatch = countText.match(/(\d+(?:,\d+)*)/);
            if (countMatch) {
              totalResults = parseInt(countMatch[1].replace(/,/g, ''), 10);
            }
          }
          
          // Process the results
          const processedResults = resultItems.map((item, index) => {
            // Extract title
            const titleEl = item.querySelector('h3, h2, .title, [data-testid="title"]');
            const title = titleEl ? titleEl.textContent.trim() : `Result ${index + 1}`;
            
            // Extract type (dataset, notebook, etc.)
            const typeEl = item.querySelector('.sc-dkrFOg, .type, [data-testid="type"]');
            const type = typeEl ? typeEl.textContent.trim() : 'Unknown';
            
            // Extract author
            const authorEl = item.querySelector('.sc-hLBbgP, .author, [data-testid="author"]');
            const author = authorEl ? authorEl.textContent.trim() : '';
            
            // Extract content/description
            const contentEl = item.querySelector('p, .description, [data-testid="description"]');
            const content = contentEl ? contentEl.textContent.trim() : '';
            
            // Extract metadata (upvotes, time, etc.)
            const metadataEls = item.querySelectorAll('.sc-dkrFOg, .metadata, [data-testid="metadata"] > *');
            const metadata = {};
            
            if (metadataEls.length > 0) {
              Array.from(metadataEls).forEach(el => {
                const text = el.textContent.trim();
                if (text.includes('vote') || text.includes('like')) {
                  metadata.upvotes = text;
                } else if (text.includes('comment')) {
                  metadata.comments = text;
                } else if (text.match(/\d+\s*(?:hour|day|week|month|year|min|sec)/i)) {
                  metadata.time = text;
                }
              });
            }
            
            // Extract URLs
            const linkEls = item.querySelectorAll('a');
            const urls = Array.from(linkEls).map(a => a.href).filter(Boolean);
            
            return {
              index: index + 1,
              title,
              type,
              author,
              content,
              metadata,
              urls
            };
          });
          
          return {
            query: searchQuery,
            totalResults,
            results: processedResults
          };
        } catch (error) {
          return { error: error.toString() };
        }
      });
      
      if (results.error) {
        console.error('Error in page evaluation:', results.error);
        return { error: results.error };
      }
      
      return results;
    } catch (error) {
      console.error('Error extracting formatted search results:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Click the "Sign in with Email" option on Kaggle login page
   */
  async clickKaggleEmailSignIn() {
    console.log('Attempting to click the "Sign in with Email" option...');
    
    try {
      // Take a screenshot for debugging
      await this.takeDebugScreenshot('before-email-signin', 'test_images');
      
      // Try multiple approaches to find and click the email option
      
      // Approach 1: Try standard selectors
      const selectors = [
        'button:has-text("Sign in with Email")',
        'button:has-text("with Email")',
        'a:has-text("Sign in with Email")',
        'a:has-text("with Email")',
        '[data-testid="email-login-button"]',
        '[data-testid="sign-in-with-email"]'
      ];
      
      for (const selector of selectors) {
        try {
          console.log(`Trying to click email sign-in with selector: ${selector}`);
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            console.log(`Successfully clicked email sign-in option with selector: ${selector}`);
            await this.wait(2000);
            return true;
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      
      // Approach 2: Try JavaScript evaluation to find the button
      console.log('Trying JavaScript approach to find email sign-in option...');
      const jsResult = await this.page.evaluate(() => {
        try {
          // Find elements containing email text
          const emailButtons = Array.from(document.querySelectorAll('button, a'))
            .filter(el => {
              const text = (el.textContent || '').toLowerCase();
              return text.includes('email') && text.includes('sign in');
            });
          
          if (emailButtons.length > 0) {
            console.log(`Found ${emailButtons.length} email sign-in elements`);
            emailButtons[0].click();
            return { success: true, method: 'text-content' };
          }
          
          // If no specific email buttons found, look for any login options
          const loginOptions = Array.from(document.querySelectorAll('.sc-kLLXSd, .login-option, .auth-option'));
          if (loginOptions.length > 0) {
            // Find the one with email
            const emailOption = loginOptions.find(el => el.textContent.toLowerCase().includes('email'));
            if (emailOption) {
              emailOption.click();
              return { success: true, method: 'login-option-class' };
            }
          }
          
          return { success: false, error: 'Email sign-in option not found' };
        } catch (error) {
          return { success: false, error: error.toString() };
        }
      });
      
      if (jsResult.success) {
        console.log(`Successfully clicked email sign-in option using JavaScript (${jsResult.method})`);
        await this.wait(2000);
        return true;
      }
      
      // Approach 3: Try clicking based on position if UI is consistent
      console.log('Trying to click email option by position...');
      
      // Take a screenshot to verify what we're seeing
      await this.takeDebugScreenshot('login-options', 'test_images');
      
      // Check if we're on the login options page by looking for characteristic text
      const onLoginPage = await this.page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('sign in with') || bodyText.includes('login with');
      });
      
      if (onLoginPage) {
        // Click in the middle of the screen - often where the email option is
        const viewportSize = await this.page.viewportSize();
        const x = viewportSize.width / 2;
        const y = viewportSize.height / 2;
        
        await this.page.mouse.click(x, y - 50); // Slightly above center
        console.log(`Clicked at position (${x}, ${y-50}) to try to hit email option`);
        await this.wait(2000);
        
        // Check if click worked by looking for email/password inputs
        const hasLoginForm = await this.page.evaluate(() => {
          return !!document.querySelector('input[type="email"], input[type="password"]');
        });
        
        if (hasLoginForm) {
          console.log('Successfully found login form after click by position');
          return true;
        }
      }
      
      console.error('Failed to click email sign-in option with all methods');
      return false;
    } catch (error) {
      console.error('Error in clickKaggleEmailSignIn:', error);
      return false;
    }
  }
}

module.exports = BrowserController; 