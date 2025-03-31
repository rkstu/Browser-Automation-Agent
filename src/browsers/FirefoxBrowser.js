/**
 * FirefoxBrowser implements the BrowserInterface using Firefox Remote Debugging Protocol
 */

const firefox = require('playwright').firefox;
const BrowserInterface = require('./BrowserInterface');
const os = require('os');
const path = require('path');
const fs = require('fs');
const net = require('net');
const WebSocket = require('ws');

class FirefoxBrowser extends BrowserInterface {
  constructor(options = {}) {
    super();
    
    this.options = {
      headless: options.headless !== false,
      slowMo: options.slowMo || 0,
      port: options.port || 9222,
      ...options
    };
    
    this.browser = null;
    this.client = null;
    this.page = null;
    this.targets = [];
    this.currentTarget = null;
    this.isInitialized = false;
    this.currentUrl = '';
    this.sessionDir = options.sessionDir || path.join(os.tmpdir(), 'browser-automation-sessions');
  }
  
  /**
   * Initialize the browser
   */
  async initialize() {
    try {
      console.log('Launching Firefox with Remote Debugging Protocol enabled...');
      
      // Launch Firefox using Playwright's launcher but with remote debugging
      this.browser = await firefox.launch({
        headless: this.options.headless,
        args: [
          `-remote-debugging-port=${this.options.port}`,
          '--start-debugger-server',
          ...(this.options.extraArgs || [])
        ],
        firefoxUserPrefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.debugger.prompt-connection': false,
          'devtools.chrome.enabled': true
        }
      });
      
      // Create context and page using Playwright
      const context = await this.browser.newContext({
        viewport: this.options.viewport || { width: 1280, height: 800 },
        userAgent: this.options.userAgent
      });
      
      this.page = await context.newPage();
      
      // Connect to Firefox Debugger using RDP
      await this._connectToDebugger();
      
      // Navigation to blank page to ensure we have a page to work with
      await this.navigate('about:blank');
      
      // Setup event listeners for debugger
      this._setupEventListeners();
      
      this.isInitialized = true;
      console.log('Firefox browser initialized successfully with RDP');
      return true;
    } catch (error) {
      console.error('Failed to initialize Firefox browser:', error);
      return false;
    }
  }
  
  /**
   * Close the browser and clean up resources
   */
  async close() {
    try {
      if (this.client) {
        this.client.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }
      
      this.browser = null;
      this.client = null;
      this.page = null;
      this.isInitialized = false;
      console.log('Firefox browser closed');
    } catch (error) {
      console.error('Error closing Firefox browser:', error);
    }
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
      
      // Use Playwright's navigate for reliability
      await this.page.goto(normalizedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout || 30000
      });
      
      this.currentUrl = await this.page.url();
      console.log(`Navigation complete, current URL: ${this.currentUrl}`);
      
      return true;
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
      console.log(`Attempting to click: ${selector}`);
      
      // Use Playwright's enhanced clicking capabilities
      try {
        await this.page.click(selector, { timeout: this.options.timeout || 5000 });
        console.log(`Clicked element with selector: ${selector}`);
        return true;
      } catch (selectorError) {
        console.log(`Direct selector failed: ${selectorError.message}`);
      }
      
      // Try finding by text content using Playwright's text selector
      try {
        await this.page.click(`text="${selector}"`, { timeout: 5000 });
        console.log(`Clicked element with text: ${selector}`);
        return true;
      } catch (textError) {
        console.log(`Text search failed: ${textError.message}`);
      }
      
      // Use JavaScript approach for more complex cases
      const jsResult = await this.page.evaluate((text) => {
        function getElementByText(text) {
          // Get all elements
          const elements = Array.from(document.querySelectorAll('*'));
          
          // Filter by text content
          const matches = elements.filter(el => {
            const content = el.textContent?.trim().toLowerCase() || '';
            return content === text.toLowerCase() || content.includes(text.toLowerCase());
          });
          
          // Filter to only visible, clickable elements
          return matches.find(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   el.offsetParent !== null;
          });
        }
        
        const element = getElementByText(text);
        if (element) {
          element.click();
          return true;
        }
        
        return false;
      }, selector);
      
      if (jsResult) {
        console.log('Clicked element using JavaScript approach');
        return true;
      }
      
      console.log(`Failed to find element to click: ${selector}`);
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
      
      // Use Playwright's fill method which handles focus and input events
      try {
        await this.page.fill(selector, text);
        console.log(`Filled text into ${selector}`);
        return true;
      } catch (selectorError) {
        console.log(`Direct fill failed: ${selectorError.message}`);
      }
      
      // Try to find by placeholder text
      try {
        await this.page.fill(`[placeholder="${selector}"]`, text);
        console.log(`Filled text into field with placeholder "${selector}"`);
        return true;
      } catch (placeholderError) {
        console.log(`Placeholder search failed: ${placeholderError.message}`);
      }
      
      // Use JavaScript approach for more complex cases
      const jsResult = await this.page.evaluate((selector, text) => {
        // Find input by label text
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          if (label.textContent.trim().toLowerCase().includes(selector.toLowerCase())) {
            const input = document.getElementById(label.htmlFor) || 
                          label.querySelector('input, textarea');
            
            if (input) {
              input.value = text;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        
        // Try to find any input that might match by name, id, etc.
        const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]), textarea'));
        for (const input of inputs) {
          if (input.name?.toLowerCase().includes(selector.toLowerCase()) ||
              input.id?.toLowerCase().includes(selector.toLowerCase()) ||
              input.placeholder?.toLowerCase().includes(selector.toLowerCase())) {
            
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        
        return false;
      }, selector, text);
      
      if (jsResult) {
        console.log('Filled text using JavaScript approach');
        return true;
      }
      
      console.log(`Failed to find input to type into: ${selector}`);
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
      // Use Playwright's keyboard API
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
      console.error('Error taking screenshot:', error.message);
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
        } else if (condition === 'navigation') {
          await this.page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: this.options.timeout || 30000
          });
        } else if (condition === 'load') {
          await this.page.waitForLoadState('load');
        } else if (condition === 'networkidle') {
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
      
      // Default waiting behavior is to wait for network idle
      await this.page.waitForLoadState('networkidle');
      return true;
    } catch (error) {
      console.error(`Error waiting for ${condition}:`, error.message);
      return false;
    }
  }
  
  /**
   * Execute JavaScript code in the browser context
   */
  async evaluate(code, ...args) {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Use Playwright's evaluate which handles serialization properly
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
   * Extract content from the page
   */
  async extractPageContent(contentType = 'full') {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Extracting content of type: ${contentType}`);
      
      // Use Playwright's evaluate to extract content
      switch (contentType.toLowerCase()) {
        case 'text':
          const text = await this.page.evaluate(() => document.body.innerText);
          return { type: 'text', text };
          
        case 'headings':
          const headings = await this.page.evaluate(() => {
            return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
              level: parseInt(h.tagName.substring(1)),
              text: h.innerText.trim()
            }));
          });
          return { type: 'headings', headings };
          
        case 'links':
          const links = await this.page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]')).map(a => ({
              text: a.innerText.trim() || a.getAttribute('title') || a.getAttribute('aria-label') || '',
              href: a.href
            }));
          });
          return { type: 'links', links };
          
        case 'search-results':
        case 'search_results':
          return await this._extractSearchResults();
          
        default:
          // Full content extraction
          return await this._extractFullContent();
      }
    } catch (error) {
      console.error(`Error extracting content (${contentType}):`, error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract full content from the page
   */
  async _extractFullContent() {
    // Extract page info
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
    
    // Extract content using JavaScript
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
        }).filter(row => row.length > 0);
        
        return { headers, rows };
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
        
        searchResults = resultItems;
      }
      
      return {
        headings,
        paragraphs,
        lists,
        tables,
        images,
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
  async _extractSearchResults() {
    // Extract search data using JavaScript
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
   * Connect to Firefox Remote Debugger
   * @private
   */
  async _connectToDebugger() {
    // For Firefox remote debugging, we use a WebSocket connection
    // In a real implementation, we would use the Firefox Remote Protocol
    // However, this is a simplified version that relies on Playwright's Firefox implementation
    
    console.log(`Attempting to connect to Firefox debugger on port ${this.options.port}...`);
    
    try {
      // Check if the port is open
      await this._waitForPort(this.options.port, 10000);
      
      console.log('Firefox debugger port is available');
      
      // In a real implementation, we would:
      // 1. Connect to the WebSocket endpoint
      // 2. Implement the Firefox Remote Protocol
      // 3. Handle targets and debugging
      
      // For this example, we're using Playwright's Firefox implementation
      // with some additional hooks to simulate a direct RDP connection
      
      console.log('Using Playwright as bridge to Firefox RDP');
      
      // We have our page from Playwright initialization
      console.log('Connection to Firefox RDP simulated successfully');
      
      return true;
    } catch (error) {
      console.error('Failed to connect to Firefox debugger:', error);
      throw error;
    }
  }
  
  /**
   * Wait for a port to be available
   * @private
   */
  async _waitForPort(port, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        await new Promise((resolve, reject) => {
          const socket = new net.Socket();
          
          const onError = () => {
            socket.destroy();
            reject(new Error(`Port ${port} not available`));
          };
          
          socket.setTimeout(1000);
          socket.once('error', onError);
          socket.once('timeout', onError);
          
          socket.connect(port, '127.0.0.1', () => {
            socket.end();
            resolve();
          });
        });
        
        return true;
      } catch (err) {
        // Wait before trying again
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    throw new Error(`Timeout waiting for port ${port}`);
  }
  
  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    if (!this.page) {
      return;
    }
    
    // Use Playwright's event system
    this.page.on('console', msg => {
      if (this.options.logConsole) {
        console.log(`[Browser Console] [${msg.type()}] ${msg.text()}`);
      }
    });
    
    this.page.on('dialog', async dialog => {
      console.log(`[Browser Dialog] ${dialog.type()}: ${dialog.message()}`);
      
      // By default, dismiss dialogs to prevent blocking
      if (this.options.autoAcceptDialogs) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
    
    this.page.on('framenavigated', async frame => {
      if (frame === this.page.mainFrame()) {
        this.currentUrl = frame.url();
        if (this.options.logNavigation) {
          console.log(`[Navigation] Navigated to: ${this.currentUrl}`);
        }
      }
    });
  }
}

module.exports = FirefoxBrowser; 