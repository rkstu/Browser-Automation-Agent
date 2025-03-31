/**
 * ChromeBrowser implements the BrowserInterface using Chrome DevTools Protocol directly
 */

const puppeteer = require('puppeteer');
const BrowserInterface = require('./BrowserInterface');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Chrome DevTools Protocol client
let CDP;
try {
  CDP = require('chrome-remote-interface');
} catch (err) {
  console.warn('chrome-remote-interface not found, installing it...');
  // This is a fallback that would happen in production if the package is missing
  // In development, you should install it with: npm install chrome-remote-interface
}

class ChromeBrowser extends BrowserInterface {
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
    this.Network = null;
    this.DOM = null;
    this.Runtime = null;
    this.Page = null;
    this.isInitialized = false;
    this.currentUrl = '';
    this.sessionDir = options.sessionDir || path.join(os.tmpdir(), 'browser-automation-sessions');
  }
  
  /**
   * Initialize the browser
   */
  async initialize() {
    try {
      // Install CDP if it's not available
      if (!CDP) {
        try {
          await this._installCDP();
          CDP = require('chrome-remote-interface');
        } catch (err) {
          console.error('Failed to install chrome-remote-interface', err);
          return false;
        }
      }
      
      // Launch Chrome using Puppeteer in CDP mode
      console.log('Launching Chrome with CDP enabled...');
      this.browser = await puppeteer.launch({
        headless: this.options.headless ? 'new' : false,
        defaultViewport: this.options.viewport || { width: 1280, height: 800 },
        args: [
          `--remote-debugging-port=${this.options.port}`,
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          ...(this.options.extraArgs || [])
        ],
        ignoreDefaultArgs: ['--disable-extensions'],
        slowMo: this.options.slowMo
      });
      
      // Get the endpoint for Chrome DevTools Protocol
      const endpoint = this.browser.wsEndpoint();
      console.log(`Chrome started with CDP endpoint: ${endpoint}`);
      
      // Wait for browser to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Connect to Chrome using CDP
      this.client = await CDP({
        port: this.options.port
      });
      
      // Extract domains we'll use frequently
      const { Network, Page, DOM, Runtime } = this.client;
      this.Network = Network;
      this.Page = Page;
      this.DOM = DOM;
      this.Runtime = Runtime;
      
      // Enable necessary domains
      await Network.enable();
      await Page.enable();
      await DOM.enable();
      await Runtime.enable();
      
      // Setup event listeners
      this._setupEventListeners();
      
      // Load session if specified
      if (this.options.session) {
        await this.loadSession(this.options.session);
      }
      
      // Navigate to about:blank to start
      await this.navigate('about:blank');
      
      this.isInitialized = true;
      console.log('Chrome browser initialized successfully with CDP');
      return true;
    } catch (error) {
      console.error('Failed to initialize Chrome browser:', error);
      return false;
    }
  }
  
  /**
   * Close the browser and clean up resources
   */
  async close() {
    try {
      if (this.client) {
        await this.client.close();
      }
      
      if (this.browser) {
        await this.browser.close();
      }
      
      this.browser = null;
      this.client = null;
      this.isInitialized = false;
      console.log('Chrome browser closed');
    } catch (error) {
      console.error('Error closing Chrome browser:', error);
    }
  }
  
  /**
   * Navigate to a URL
   */
  async navigate(url) {
    if (!this.client || !this.Page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Add http:// if no protocol is specified
      const normalizedUrl = url.match(/^[a-zA-Z]+:\/\//) ? url : `https://${url}`;
      
      console.log(`Navigating to: ${normalizedUrl}`);
      
      // Track when navigation completes
      const loadPromise = new Promise(resolve => {
        this.Page.loadEventFired(() => resolve());
      });
      
      // Navigate
      await this.Page.navigate({ url: normalizedUrl });
      
      // Wait for load event with timeout
      const timeout = this.options.timeout || 30000;
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeout));
      await Promise.race([loadPromise, timeoutPromise]);
      
      // Check if we timed out
      if (!loadPromise.resolved) {
        console.warn(`Navigation timeout (${timeout}ms) reached`);
      }
      
      // Get current URL
      const result = await this.Runtime.evaluate({ expression: 'window.location.href' });
      this.currentUrl = result.result.value;
      
      console.log(`Navigation complete, current URL: ${this.currentUrl}`);
      return true;
    } catch (error) {
      console.error(`Error navigating to ${url}:`, error);
      return false;
    }
  }
  
  /**
   * Click on an element
   */
  async click(selector) {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Attempting to click: ${selector}`);
      
      // Try to find the element
      const element = await this._findElement(selector);
      if (!element) {
        console.error(`Element not found: ${selector}`);
        return false;
      }
      
      // Get element center coordinates
      const box = await this._getElementBox(element.nodeId);
      if (!box) {
        console.error('Unable to determine element position');
        return false;
      }
      
      const centerX = Math.floor(box.x + box.width / 2);
      const centerY = Math.floor(box.y + box.height / 2);
      
      // Simulate a mouse click
      await this._simulateMouseClick(centerX, centerY);
      
      console.log(`Clicked element at (${centerX}, ${centerY})`);
      return true;
    } catch (error) {
      console.error(`Error clicking ${selector}:`, error);
      return false;
    }
  }
  
  /**
   * Type text into an input element
   */
  async type(selector, text) {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Typing "${text}" into ${selector}`);
      
      // Try to find the element
      const element = await this._findElement(selector);
      if (!element) {
        console.error(`Element not found: ${selector}`);
        return false;
      }
      
      // Focus the element
      await this.DOM.focus({ nodeId: element.nodeId });
      
      // Clear the field
      await this.Runtime.evaluate({
        expression: `(function() {
          const elem = document.activeElement;
          elem.value = '';
          elem.dispatchEvent(new Event('input', { bubbles: true }));
        })()`
      });
      
      // Type the text
      for (const char of text) {
        await this.Input.dispatchKeyEvent({
          type: 'keyDown',
          text: char
        });
        
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      }
      
      // Trigger input event
      await this.Runtime.evaluate({
        expression: `(function() {
          const elem = document.activeElement;
          elem.dispatchEvent(new Event('input', { bubbles: true }));
          elem.dispatchEvent(new Event('change', { bubbles: true }));
        })()`
      });
      
      console.log(`Typed text into element`);
      return true;
    } catch (error) {
      console.error(`Error typing into ${selector}:`, error);
      return false;
    }
  }
  
  /**
   * Press a keyboard key
   */
  async pressKey(key) {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Pressing key: ${key}`);
      
      // Map common key names to CDP key codes
      const keyMap = {
        'enter': 'Enter',
        'tab': 'Tab',
        'escape': 'Escape',
        'esc': 'Escape',
        'backspace': 'Backspace',
        'delete': 'Delete',
        'arrowup': 'ArrowUp',
        'arrowdown': 'ArrowDown',
        'arrowleft': 'ArrowLeft',
        'arrowright': 'ArrowRight'
      };
      
      // Convert key to CDP format
      const cdpKey = keyMap[key.toLowerCase()] || key;
      
      // Use Runtime to simulate key press
      await this.Runtime.evaluate({
        expression: `(function() {
          const event = new KeyboardEvent('keydown', { key: '${cdpKey}', bubbles: true });
          document.activeElement.dispatchEvent(event);
          
          const upEvent = new KeyboardEvent('keyup', { key: '${cdpKey}', bubbles: true });
          document.activeElement.dispatchEvent(upEvent);
        })()`
      });
      
      console.log(`Pressed key: ${key}`);
      return true;
    } catch (error) {
      console.error(`Error pressing key ${key}:`, error);
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
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Capture screenshot
      const { data } = await this.Page.captureScreenshot();
      
      // Save to file
      fs.writeFileSync(path, Buffer.from(data, 'base64'));
      
      console.log(`Screenshot saved to: ${path}`);
      return path;
    } catch (error) {
      console.error('Error taking screenshot:', error);
      return null;
    }
  }
  
  /**
   * Wait for a specified time or condition
   */
  async wait(condition) {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // If condition is a number, wait for that many milliseconds
      if (typeof condition === 'number') {
        await new Promise(resolve => setTimeout(resolve, condition));
        return true;
      }
      
      // If condition is a string representing a selector, wait for that element
      if (typeof condition === 'string') {
        if (condition.startsWith('selector:')) {
          const selector = condition.substring('selector:'.length);
          await this._waitForElement(selector);
        } else if (condition === 'navigation') {
          await new Promise(resolve => {
            this.Page.loadEventFired(() => resolve());
          });
        } else if (condition === 'networkidle') {
          await new Promise(resolve => {
            let timeout;
            let pendingRequests = 0;
            
            const checkDone = () => {
              if (pendingRequests === 0) {
                clearTimeout(timeout);
                resolve();
              }
            };
            
            this.Network.requestWillBeSent(() => {
              pendingRequests++;
              clearTimeout(timeout);
            });
            
            this.Network.responseReceived(() => {
              pendingRequests--;
              clearTimeout(timeout);
              timeout = setTimeout(checkDone, 500);
            });
            
            this.Network.loadingFailed(() => {
              pendingRequests--;
              clearTimeout(timeout);
              timeout = setTimeout(checkDone, 500);
            });
            
            timeout = setTimeout(checkDone, 500);
          });
        } else {
          // Default to waiting for a selector
          await this._waitForElement(condition);
        }
        return true;
      }
      
      // Default waiting behavior is to wait for network idle
      await new Promise(resolve => {
        let timeout;
        let pendingRequests = 0;
        
        const checkDone = () => {
          if (pendingRequests === 0) {
            clearTimeout(timeout);
            resolve();
          }
        };
        
        this.Network.requestWillBeSent(() => {
          pendingRequests++;
          clearTimeout(timeout);
        });
        
        this.Network.responseReceived(() => {
          pendingRequests--;
          clearTimeout(timeout);
          timeout = setTimeout(checkDone, 500);
        });
        
        this.Network.loadingFailed(() => {
          pendingRequests--;
          clearTimeout(timeout);
          timeout = setTimeout(checkDone, 500);
        });
        
        timeout = setTimeout(checkDone, 500);
      });
      
      return true;
    } catch (error) {
      console.error(`Error waiting for ${condition}:`, error);
      return false;
    }
  }
  
  /**
   * Execute JavaScript code in the browser context
   */
  async evaluate(code, ...args) {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Convert function to string if needed
      let expression;
      if (typeof code === 'function') {
        expression = `(${code})(${args.map(JSON.stringify).join(',')})`;
      } else {
        expression = code;
      }
      
      // Execute the code
      const result = await this.Runtime.evaluate({ expression });
      
      // Check for errors
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text);
      }
      
      // Extract result value
      if (result.result.value !== undefined) {
        return result.result.value;
      }
      
      // For complex objects
      if (result.result.type === 'object' && result.result.objectId) {
        const props = await this.Runtime.getProperties({
          objectId: result.result.objectId,
          ownProperties: true
        });
        
        return props.result.reduce((obj, prop) => {
          if (prop.value && prop.value.value !== undefined) {
            obj[prop.name] = prop.value.value;
          }
          return obj;
        }, {});
      }
      
      return null;
    } catch (error) {
      console.error('Error executing JavaScript:', error);
      throw error;
    }
  }
  
  /**
   * Get the current URL
   */
  async getCurrentUrl() {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      const result = await this.evaluate('window.location.href');
      this.currentUrl = result;
      return this.currentUrl;
    } catch (error) {
      console.error('Error getting current URL:', error);
      return null;
    }
  }
  
  /**
   * Get the page title
   */
  async getTitle() {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      return await this.evaluate('document.title');
    } catch (error) {
      console.error('Error getting page title:', error);
      return null;
    }
  }
  
  /**
   * Extract content from the page
   */
  async extractPageContent(contentType = 'full') {
    if (!this.client) {
      throw new Error('Browser not initialized');
    }
    
    try {
      console.log(`Extracting content of type: ${contentType}`);
      
      // Execute JavaScript to extract content based on type
      let expression;
      
      switch (contentType.toLowerCase()) {
        case 'text':
          expression = 'document.body.innerText';
          const text = await this.evaluate(expression);
          return { type: 'text', text };
          
        case 'headings':
          expression = `
            Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
              level: parseInt(h.tagName.substring(1)),
              text: h.innerText.trim()
            }))
          `;
          const headings = await this.evaluate(expression);
          return { type: 'headings', headings };
          
        case 'links':
          expression = `
            Array.from(document.querySelectorAll('a[href]')).map(a => ({
              text: a.innerText.trim() || a.getAttribute('title') || a.getAttribute('aria-label') || '',
              href: a.href
            }))
          `;
          const links = await this.evaluate(expression);
          return { type: 'links', links };
          
        case 'search-results':
        case 'search_results':
          // Use a specialized extraction function
          return await this._extractSearchResults();
          
        default:
          // Full content extraction
          return await this._extractFullContent();
      }
    } catch (error) {
      console.error(`Error extracting content (${contentType}):`, error);
      return { error: error.message };
    }
  }
  
  /**
   * Extract full content from the page
   */
  async _extractFullContent() {
    // JavaScript to extract comprehensive page content
    const expression = `
      (function() {
        // Extract page info
        const pageInfo = {
          title: document.title,
          url: window.location.href,
          metaDescription: document.querySelector('meta[name="description"]')?.content || '',
          isSearchPage: window.location.href.includes('/search') || 
                       document.title.toLowerCase().includes('search') ||
                       !!document.querySelector('input[type="search"]')
        };
        
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
          // Look for common search result patterns
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
          pageInfo,
          headings,
          paragraphs,
          lists,
          tables,
          images,
          isSearchPage,
          searchResults,
          rawText: document.body.innerText
        };
      })()
    `;
    
    // Execute and return
    const content = await this.evaluate(expression);
    return {
      type: 'full',
      ...content
    };
  }
  
  /**
   * Extract search results from the page
   */
  async _extractSearchResults() {
    // JavaScript to extract search results
    const expression = `
      (function() {
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
      })()
    `;
    
    // Execute and return
    const searchData = await this.evaluate(expression);
    return {
      type: 'search_results',
      ...searchData
    };
  }
  
  /**
   * Find an element by selector or text
   * @private
   */
  async _findElement(selector) {
    try {
      // First try to find by CSS selector
      const { root } = await this.DOM.getDocument();
      const { nodeId } = await this.DOM.querySelector({
        nodeId: root.nodeId,
        selector
      });
      
      if (nodeId) {
        return { nodeId };
      }
      
      // If not found, try to find by text content
      const result = await this.Runtime.evaluate({
        expression: `
          (function() {
            // Try to find by exact text match
            const elements = Array.from(document.querySelectorAll('*')).filter(el => {
              return el.innerText && el.innerText.trim() === "${selector.replace(/"/g, '\\"')}";
            });
            
            if (elements.length > 0) {
              return elements[0];
            }
            
            // Try to find by containing text
            const containingElements = Array.from(document.querySelectorAll('*')).filter(el => {
              return el.innerText && el.innerText.toLowerCase().includes("${selector.replace(/"/g, '\\"')}".toLowerCase());
            });
            
            if (containingElements.length > 0) {
              return containingElements[0];
            }
            
            return null;
          })()
        `,
        returnByValue: false
      });
      
      if (result.result.objectId) {
        // Get nodeId from object
        const { nodeId } = await this.DOM.requestNode({
          objectId: result.result.objectId
        });
        
        return { nodeId };
      }
      
      return null;
    } catch (error) {
      console.error(`Error finding element ${selector}:`, error);
      return null;
    }
  }
  
  /**
   * Get element bounding box
   * @private
   */
  async _getElementBox(nodeId) {
    try {
      const { model } = await this.DOM.getBoxModel({ nodeId });
      if (!model) {
        return null;
      }
      
      // Extract dimensions from box model
      const [x, y, width, height] = [
        model.content[0],
        model.content[1],
        model.width,
        model.height
      ];
      
      return { x, y, width, height };
    } catch (error) {
      console.error('Error getting element box:', error);
      return null;
    }
  }
  
  /**
   * Simulate a mouse click at coordinates
   * @private
   */
  async _simulateMouseClick(x, y) {
    try {
      // Use Runtime to simulate click events
      await this.Runtime.evaluate({
        expression: `
          (function() {
            const element = document.elementFromPoint(${x}, ${y});
            if (!element) return false;
            
            // Focus the element
            element.focus();
            
            // Create and dispatch mouse events
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: ${x},
              clientY: ${y}
            });
            
            element.dispatchEvent(clickEvent);
            return true;
          })()
        `
      });
    } catch (error) {
      console.error('Error simulating mouse click:', error);
      throw error;
    }
  }
  
  /**
   * Wait for an element to appear
   * @private
   */
  async _waitForElement(selector, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = await this._findElement(selector);
      if (element) {
        return element;
      }
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for element: ${selector}`);
  }
  
  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    if (!this.client) return;
    
    // Listen for console messages
    this.Runtime.consoleAPICalled(({ type, args }) => {
      if (this.options.logConsole) {
        const values = args.map(arg => arg.value || arg.description).join(' ');
        console.log(`[Browser Console] [${type}] ${values}`);
      }
    });
    
    // Listen for navigation
    this.Page.frameNavigated(({ frame }) => {
      if (frame.parentId === undefined) { // Main frame
        this.currentUrl = frame.url;
        if (this.options.logNavigation) {
          console.log(`[Navigation] Navigated to: ${this.currentUrl}`);
        }
      }
    });
    
    // Listen for dialog events
    this.Page.javascriptDialogOpening(async ({ message, type }) => {
      console.log(`[Browser Dialog] ${type}: ${message}`);
      
      // By default, dismiss dialogs to prevent blocking
      await this.Page.handleJavaScriptDialog({
        accept: this.options.autoAcceptDialogs !== false
      });
    });
  }
  
  /**
   * Install CDP if not available
   * @private
   */
  async _installCDP() {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      exec('npm install chrome-remote-interface', (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
  }
}

module.exports = ChromeBrowser; 