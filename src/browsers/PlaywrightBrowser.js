/**
 * PlaywrightBrowser implements the BrowserInterface using Playwright
 */

const { chromium, firefox, webkit } = require('playwright');
const BrowserInterface = require('./BrowserInterface');
const os = require('os');
const path = require('path');
const fs = require('fs');

class PlaywrightBrowser extends BrowserInterface {
  constructor(options = {}) {
    super();
    
    this.options = {
      browserName: options.browserName || 'chromium',
      headless: options.headless !== false,
      slowMo: options.slowMo || 0,
      ...options
    };
    
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
    this.currentUrl = '';
    this.sessionDir = options.sessionDir || path.join(os.tmpdir(), 'browser-automation-sessions');
  }
  
  /**
   * Initialize the browser
   */
  async initialize() {
    try {
      // Select the appropriate browser
      const browserType = this._getBrowserType();
      
      // Launch options
      const launchOptions = {
        headless: this.options.headless,
        slowMo: this.options.slowMo,
        args: this._getDefaultArgs(),
        ...this.options.launchOptions
      };
      
      // Add proxy if configured
      if (this.options.proxy) {
        launchOptions.proxy = this.options.proxy;
      }
      
      // Launch browser
      console.log(`Launching ${this.options.browserName} with options:`, launchOptions);
      this.browser = await browserType.launch(launchOptions);
      
      // Create browser context
      const contextOptions = {
        viewport: this.options.viewport || { width: 1280, height: 800 },
        userAgent: this.options.userAgent,
        ...this.options.contextOptions
      };
      
      // Load session if specified
      if (this.options.session) {
        contextOptions.storageState = this.options.session;
      }
      
      this.context = await this.browser.newContext(contextOptions);
      
      // Create page
      this.page = await this.context.newPage();
      
      // Set up event listeners
      this._setupEventListeners();
      
      this.isInitialized = true;
      console.log(`${this.options.browserName} browser initialized successfully`);
      return true;
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      return false;
    }
  }
  
  /**
   * Close the browser and clean up resources
   */
  async close() {
    if (this.page) {
      await this.page.close().catch(e => console.error('Error closing page:', e));
    }
    
    if (this.context) {
      await this.context.close().catch(e => console.error('Error closing context:', e));
    }
    
    if (this.browser) {
      await this.browser.close().catch(e => console.error('Error closing browser:', e));
    }
    
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
    console.log('Browser closed');
  }
  
  /**
   * Navigate to a URL
   */
  async navigate(url) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Add http:// if no protocol is specified
      const normalizedUrl = url.match(/^[a-zA-Z]+:\/\//) ? url : `https://${url}`;
      
      console.log(`Navigating to: ${normalizedUrl}`);
      const response = await this.page.goto(normalizedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout || 30000
      });
      
      this.currentUrl = await this.page.url();
      console.log(`Navigation complete, current URL: ${this.currentUrl}`);
      
      return response && response.ok();
    } catch (error) {
      console.error(`Error navigating to ${url}:`, error.message);
      return false;
    }
  }
  
  /**
   * Click on an element
   */
  async click(selector) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Try different approaches to find and click the element
      console.log(`Attempting to click: ${selector}`);
      
      // Try direct selector first
      try {
        await this.page.click(selector, { timeout: this.options.timeout || 5000 });
        console.log(`Clicked element with selector: ${selector}`);
        return true;
      } catch (selectorError) {
        console.log(`Direct selector failed: ${selectorError.message}`);
      }
      
      // Try finding by text content
      try {
        console.log(`Trying to find element by text content: ${selector}`);
        const elementWithText = await this.page.locator(`text="${selector}"`).first();
        await elementWithText.click();
        console.log(`Clicked element with text: ${selector}`);
        return true;
      } catch (textError) {
        console.log(`Text search failed: ${textError.message}`);
      }
      
      // Try finding by aria-label or title
      try {
        console.log(`Trying to find element by aria-label or title: ${selector}`);
        const elementWithLabel = await this.page.locator(`[aria-label="${selector}"], [title="${selector}"]`).first();
        await elementWithLabel.click();
        console.log(`Clicked element with aria-label/title: ${selector}`);
        return true;
      } catch (labelError) {
        console.log(`Aria-label/title search failed: ${labelError.message}`);
      }
      
      // Try more aggressive approaches using JavaScript
      console.log('Trying JavaScript approach to find clickable element...');
      const jsClick = await this.page.evaluate((text) => {
        // Helper function to get text content
        const getElementText = (element) => {
          return element.innerText || element.textContent || '';
        };
        
        // Find all potentially clickable elements
        const clickables = [
          ...document.querySelectorAll('a, button, input[type="button"], input[type="submit"], [role="button"], [onclick]')
        ];
        
        // Try to find by text content
        for (const element of clickables) {
          const elementText = getElementText(element).trim().toLowerCase();
          if (elementText.includes(text.toLowerCase())) {
            element.click();
            return true;
          }
        }
        
        // If no exact match, try partial matches or similar text
        for (const element of clickables) {
          const elementText = getElementText(element).trim().toLowerCase();
          const words = text.toLowerCase().split(/\s+/);
          // Check if at least half the words match
          const matchingWords = words.filter(word => elementText.includes(word));
          if (matchingWords.length > words.length / 2) {
            element.click();
            return true;
          }
        }
        
        return false;
      }, selector);
      
      if (jsClick) {
        console.log('Clicked element using JavaScript approach');
        return true;
      }
      
      console.error(`Failed to click element: ${selector}`);
      return false;
    } catch (error) {
      console.error(`Error clicking ${selector}:`, error.message);
      return false;
    }
  }
  
  /**
   * Type text into an input element
   */
  async type(selector, text) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Typing "${text}" into ${selector}`);
      
      // Try direct selector first
      try {
        await this.page.fill(selector, text);
        return true;
      } catch (selectorError) {
        console.log(`Direct fill failed: ${selectorError.message}`);
      }
      
      // Try finding by placeholder, label, or aria-label
      try {
        const inputSelectors = [
          `input[placeholder="${selector}"]`,
          `textarea[placeholder="${selector}"]`,
          `[aria-label="${selector}"]`,
          `input[name="${selector}"]`,
          `textarea[name="${selector}"]`
        ];
        
        for (const inputSelector of inputSelectors) {
          try {
            await this.page.fill(inputSelector, text);
            console.log(`Filled using selector: ${inputSelector}`);
            return true;
          } catch (e) {
            // Continue to next selector
          }
        }
      } catch (altSelectorError) {
        console.log(`Alternative selectors failed: ${altSelectorError.message}`);
      }
      
      // Try JavaScript approach as last resort
      const jsType = await this.page.evaluate((labelText, inputText) => {
        // Try to find input by looking at labels
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          if (label.textContent.toLowerCase().includes(labelText.toLowerCase())) {
            const input = document.getElementById(label.htmlFor) || 
                          label.querySelector('input, textarea');
            
            if (input) {
              input.value = inputText;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        
        // Try to find any visible input/textarea
        const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]), textarea'));
        const visibleInputs = inputs.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        });
        
        if (visibleInputs.length > 0) {
          for (const input of visibleInputs) {
            const placeholder = input.getAttribute('placeholder') || '';
            const name = input.getAttribute('name') || '';
            const type = input.getAttribute('type') || '';
            
            // Skip submit buttons and non-text inputs
            if (type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio') {
              continue;
            }
            
            if (placeholder.toLowerCase().includes(labelText.toLowerCase()) || 
                name.toLowerCase().includes(labelText.toLowerCase())) {
              input.value = inputText;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          
          // If no match, use the first visible input as a fallback
          const firstInput = visibleInputs[0];
          firstInput.value = inputText;
          firstInput.dispatchEvent(new Event('input', { bubbles: true }));
          firstInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        return false;
      }, selector, text);
      
      if (jsType) {
        console.log('Typed text using JavaScript approach');
        return true;
      }
      
      console.error(`Failed to type into element: ${selector}`);
      return false;
    } catch (error) {
      console.error(`Error typing into ${selector}:`, error.message);
      return false;
    }
  }
  
  /**
   * Press a keyboard key
   */
  async pressKey(key) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      await this.page.keyboard.press(key);
      console.log(`Pressed key: ${key}`);
      return true;
    } catch (error) {
      console.error(`Error pressing key ${key}:`, error.message);
      return false;
    }
  }
  
  /**
   * Press Enter key
   */
  async pressEnter() {
    return this.pressKey('Enter');
  }
  
  /**
   * Take a screenshot
   */
  async screenshot(path) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      await this.page.screenshot({ path });
      console.log(`Screenshot saved to: ${path}`);
      return path;
    } catch (error) {
      console.error(`Error taking screenshot:`, error.message);
      return null;
    }
  }
  
  /**
   * Wait for a specified time or condition
   */
  async wait(condition) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // If condition is a number, wait for that many milliseconds
      if (typeof condition === 'number') {
        await this.page.waitForTimeout(condition);
        return true;
      }
      
      // If condition is a string representing a selector, wait for that element
      if (typeof condition === 'string') {
        if (condition.startsWith('selector:')) {
          const selector = condition.substring('selector:'.length);
          await this.page.waitForSelector(selector, { 
            state: 'visible',
            timeout: this.options.timeout || 30000
          });
        } else if (condition.startsWith('navigation')) {
          await this.page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: this.options.timeout || 30000
          });
        } else if (condition.startsWith('load')) {
          await this.page.waitForLoadState('load');
        } else if (condition.startsWith('networkidle')) {
          await this.page.waitForLoadState('networkidle');
        } else {
          // Default to waiting for a visible element
          await this.page.waitForSelector(condition, { 
            state: 'visible',
            timeout: this.options.timeout || 10000
          });
        }
        return true;
      }
      
      // If condition is a function, execute it as a predicate
      if (typeof condition === 'function') {
        await this.page.waitForFunction(condition, { 
          timeout: this.options.timeout || 30000
        });
        return true;
      }
      
      // Default waiting behavior is to wait for network idle
      await this.page.waitForLoadState('networkidle');
      return true;
    } catch (error) {
      console.error(`Error waiting for ${condition}:`, error.message);
      return false;
    }
  }
  
  /**
   * Extract content from the page
   */
  async extractPageContent(contentType = 'full') {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Extracting content of type: ${contentType}`);
      
      // Get current page info
      const pageInfo = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          metaDescription: document.querySelector('meta[name="description"]')?.content || '',
          isSearchPage: window.location.href.includes('/search') || 
                        document.title.toLowerCase().includes('search') ||
                        !!document.querySelector('input[type="search"]')
        };
      });
      
      // Extract content based on type
      switch (contentType.toLowerCase()) {
        case 'text':
          const text = await this.page.evaluate(() => document.body.innerText);
          return { type: 'text', text, pageInfo };
          
        case 'headings':
          const headings = await this.page.evaluate(() => {
            return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
              level: parseInt(h.tagName.substring(1)),
              text: h.innerText.trim()
            }));
          });
          return { type: 'headings', headings, pageInfo };
          
        case 'links':
          const links = await this.page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map(a => ({
              text: a.innerText.trim() || a.getAttribute('title') || a.getAttribute('aria-label') || '',
              href: a.href
            }));
          });
          return { type: 'links', links, pageInfo };
          
        case 'search-results':
        case 'search_results':
          return this.extractSearchResults();
          
        default:
          // Full content extraction
          return this.extractFullContent();
      }
    } catch (error) {
      console.error(`Error extracting content (${contentType}):`, error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract full content from the page
   */
  async extractFullContent() {
    const pageInfo = await this.page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        metaDescription: document.querySelector('meta[name="description"]')?.content || '',
        isSearchPage: window.location.href.includes('/search') || 
                     document.title.toLowerCase().includes('search') ||
                     !!document.querySelector('input[type="search"]')
      };
    });
    
    const content = await this.page.evaluate(() => {
      // Extract headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        level: parseInt(h.tagName.substring(1)),
        text: h.innerText.trim()
      }));
      
      // Extract paragraphs
      const paragraphs = Array.from(document.querySelectorAll('p')).map(p => p.innerText.trim()).filter(p => p.length > 0);
      
      // Extract images
      const images = Array.from(document.querySelectorAll('img[src]')).map(img => ({
        src: img.src,
        alt: img.alt || '',
        width: img.width,
        height: img.height
      }));
      
      // Extract lists
      const lists = Array.from(document.querySelectorAll('ul, ol')).map(list => {
        const items = Array.from(list.querySelectorAll('li')).map(li => li.innerText.trim());
        const type = list.tagName.toLowerCase() === 'ul' ? 'unordered' : 'ordered';
        return { type, items };
      });
      
      // Extract tables
      const tables = Array.from(document.querySelectorAll('table')).map(table => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
        const rows = Array.from(table.querySelectorAll('tr')).map(tr => {
          return Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
        }).filter(row => row.length > 0); // Filter out rows without cells
        
        return { headers, rows };
      });
      
      // Extract forms
      const forms = Array.from(document.querySelectorAll('form')).map(form => {
        const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(input => {
          return {
            type: input.type || input.tagName.toLowerCase(),
            name: input.name || '',
            placeholder: input.placeholder || '',
            label: document.querySelector(`label[for="${input.id}"]`)?.innerText.trim() || ''
          };
        });
        
        return { action: form.action, method: form.method, inputs };
      });
      
      // Check if this is a search results page
      const isSearchPage = window.location.href.includes('/search') || 
                          document.title.toLowerCase().includes('search') ||
                          !!document.querySelector('input[type="search"]');
      
      // Extract search results if it's a search page
      let searchResults = [];
      if (isSearchPage) {
        // Generic search result detection - looking for repetitive item patterns
        const resultItems = Array.from(document.querySelectorAll('.result, .search-result, [role="listitem"], .item, .card, article')).map((item, index) => {
          const title = item.querySelector('h3, h2, h4, .title, [role="heading"]')?.innerText.trim() || 'Untitled Result';
          const description = item.querySelector('p, .description')?.innerText.trim() || '';
          const link = item.querySelector('a')?.href || '';
          
          return {
            index: index + 1,
            title,
            description,
            link
          };
        });
        
        // If we found structured results, use them
        if (resultItems.length > 0) {
          searchResults = resultItems;
        } else {
          // Fallback: look for any list of items with links as potential search results
          const links = Array.from(document.querySelectorAll('a[href]')).filter(a => {
            // Filter out navigation, header, footer links
            const parent = a.closest('nav, header, footer');
            return !parent && a.innerText.trim().length > 10;
          }).map((link, index) => {
            return {
              index: index + 1,
              title: link.innerText.trim(),
              link: link.href
            };
          });
          
          if (links.length > 3) { // If we found at least a few links, consider them as results
            searchResults = links;
          }
        }
      }
      
      return {
        headings,
        paragraphs,
        lists,
        tables,
        images,
        forms,
        isSearchPage,
        searchResults,
        rawText: document.body.innerText
      };
    });
    
    return {
      type: 'full',
      pageInfo,
      ...content
    };
  }
  
  /**
   * Extract search results from the page
   */
  async extractSearchResults() {
    const searchData = await this.page.evaluate(() => {
      // Try to find the search input to get the current query
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"], input[aria-label*="Search"]');
      const searchQuery = searchInput ? searchInput.value : '';
      
      // Try different selectors for search results
      const selectors = [
        '.search-result', '.result', '[role="listitem"]',
        '.item', '.card', 'article', '.product',
        '.mdc-list-item', '[data-testid="search-results"] > div'
      ];
      
      let results = [];
      let usedSelector = '';
      
      // Try each selector
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results = Array.from(elements).map((item, index) => {
            // Extract details
            const title = item.querySelector('h3, h2, h4, .title, [role="heading"]')?.innerText.trim() || 
                         item.querySelector('a')?.innerText.trim() || 
                         'Result ' + (index + 1);
                         
            const description = item.querySelector('p, .description')?.innerText.trim() || '';
            const link = item.querySelector('a')?.href || '';
            
            return {
              index: index + 1,
              title,
              description,
              link
            };
          });
          
          usedSelector = selector;
          break;
        }
      }
      
      // If no results found with specific selectors, try a more generic approach
      if (results.length === 0) {
        // Look for any list of items with links as potential search results
        const links = Array.from(document.querySelectorAll('a[href]')).filter(a => {
          // Filter out navigation, header, footer links
          const parent = a.closest('nav, header, footer');
          return !parent && a.innerText.trim().length > 10;
        }).map((link, index) => {
          return {
            index: index + 1,
            title: link.innerText.trim(),
            link: link.href
          };
        });
        
        if (links.length > 3) { // If we found at least a few links, consider them as results
          results = links;
          usedSelector = 'generic-links';
        }
      }
      
      return {
        query: searchQuery,
        results,
        usedSelector,
        isSearchPage: true
      };
    });
    
    return {
      type: 'search_results',
      ...searchData
    };
  }
  
  /**
   * Execute JavaScript code in the browser context
   */
  async evaluate(code, ...args) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      return await this.page.evaluate(code, ...args);
    } catch (error) {
      console.error('Error executing JavaScript:', error.message);
      throw error;
    }
  }
  
  /**
   * Get the current URL
   */
  async getCurrentUrl() {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      this.currentUrl = await this.page.url();
      return this.currentUrl;
    } catch (error) {
      console.error('Error getting current URL:', error.message);
      return null;
    }
  }
  
  /**
   * Get the page title
   */
  async getTitle() {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      return await this.page.title();
    } catch (error) {
      console.error('Error getting page title:', error.message);
      return null;
    }
  }
  
  /**
   * Save current session state
   */
  async saveSession(path) {
    if (!this.context) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Create directory if it doesn't exist
      const dir = path ? require('path').dirname(path) : this.sessionDir;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Generate path if not provided
      const sessionPath = path || `${this.sessionDir}/session-${Date.now()}.json`;
      
      // Save state
      const state = await this.context.storageState();
      fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
      
      console.log(`Session saved to: ${sessionPath}`);
      return sessionPath;
    } catch (error) {
      console.error('Error saving session:', error.message);
      return null;
    }
  }
  
  /**
   * Load a previously saved session
   */
  async loadSession(path) {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Check if file exists
      if (!fs.existsSync(path)) {
        throw new Error(`Session file not found: ${path}`);
      }
      
      // Read session state
      const state = JSON.parse(fs.readFileSync(path, 'utf8'));
      
      // Close existing context if any
      if (this.context) {
        await this.context.close();
      }
      
      // Create new context with saved state
      this.context = await this.browser.newContext({
        storageState: state,
        viewport: this.options.viewport || { width: 1280, height: 800 },
        userAgent: this.options.userAgent,
        ...this.options.contextOptions
      });
      
      // Create new page
      this.page = await this.context.newPage();
      
      // Setup event listeners
      this._setupEventListeners();
      
      console.log(`Session loaded from: ${path}`);
      return true;
    } catch (error) {
      console.error('Error loading session:', error.message);
      return false;
    }
  }
  
  /**
   * Set proxy configuration
   */
  async setProxy(proxyConfig) {
    // Proxy can only be set at browser launch time for Playwright
    console.warn('Proxy can only be set at browser launch time with Playwright. Restart the browser to apply proxy.');
    return false;
  }
  
  /**
   * Helper to get the appropriate browser type
   * @private
   */
  _getBrowserType() {
    switch (this.options.browserName.toLowerCase()) {
      case 'firefox':
        return firefox;
      case 'webkit':
      case 'safari':
        return webkit;
      case 'chrome':
      case 'chromium':
      default:
        return chromium;
    }
  }
  
  /**
   * Setup page event listeners
   * @private
   */
  _setupEventListeners() {
    if (!this.page) return;
    
    // Listen for console messages
    this.page.on('console', msg => {
      const text = msg.text();
      if (this.options.logConsole) {
        console.log(`[Browser Console] [${msg.type()}] ${text}`);
      }
    });
    
    // Listen for dialog events
    this.page.on('dialog', async dialog => {
      const message = dialog.message();
      console.log(`[Browser Dialog] ${dialog.type()}: ${message}`);
      
      // By default, dismiss dialogs to prevent blocking
      if (this.options.autoAcceptDialogs) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
    
    // Listen for navigation
    this.page.on('framenavigated', async frame => {
      if (frame === this.page.mainFrame()) {
        this.currentUrl = frame.url();
        if (this.options.logNavigation) {
          console.log(`[Navigation] Navigated to: ${this.currentUrl}`);
        }
      }
    });
  }
  
  /**
   * Get default browser arguments
   * @private
   */
  _getDefaultArgs() {
    const defaultArgs = [
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security'
    ];
    
    if (this.options.extraArgs) {
      return [...defaultArgs, ...this.options.extraArgs];
    }
    
    return defaultArgs;
  }
}

module.exports = PlaywrightBrowser; 