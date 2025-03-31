/**
 * BrowserInterface defines the common interface that all browser implementations must support
 * This ensures consistent behavior regardless of underlying implementation
 */

class BrowserInterface {
  /**
   * Initialize the browser
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    throw new Error('Method not implemented: initialize()');
  }
  
  /**
   * Close the browser and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('Method not implemented: close()');
  }
  
  /**
   * Navigate to a URL
   * @param {string} url - URL to navigate to
   * @returns {Promise<boolean>} - Whether navigation was successful
   */
  async navigate(url) {
    throw new Error('Method not implemented: navigate()');
  }
  
  /**
   * Click on an element
   * @param {string} selector - Element selector or description
   * @returns {Promise<boolean>} - Whether click was successful
   */
  async click(selector) {
    throw new Error('Method not implemented: click()');
  }
  
  /**
   * Type text into an input element
   * @param {string} selector - Element selector or description
   * @param {string} text - Text to type
   * @returns {Promise<boolean>} - Whether typing was successful
   */
  async type(selector, text) {
    throw new Error('Method not implemented: type()');
  }
  
  /**
   * Extract content from the page
   * @param {string} contentType - Type of content to extract ('text', 'headings', etc.)
   * @returns {Promise<Object>} - Extracted content
   */
  async extractPageContent(contentType) {
    throw new Error('Method not implemented: extractPageContent()');
  }
  
  /**
   * Press a keyboard key
   * @param {string} key - Key to press
   * @returns {Promise<boolean>} - Whether key press was successful
   */
  async pressKey(key) {
    throw new Error('Method not implemented: pressKey()');
  }
  
  /**
   * Take a screenshot
   * @param {string} path - Path to save screenshot
   * @returns {Promise<string>} - Path to screenshot
   */
  async screenshot(path) {
    throw new Error('Method not implemented: screenshot()');
  }
  
  /**
   * Wait for a specified time or condition
   * @param {number|string|Function} condition - Duration in ms, condition description, or function
   * @returns {Promise<boolean>} - Whether wait completed successfully
   */
  async wait(condition) {
    throw new Error('Method not implemented: wait()');
  }
  
  /**
   * Execute JavaScript code in the browser context
   * @param {Function|string} code - JavaScript code to execute
   * @param {...any} args - Arguments to pass to the function
   * @returns {Promise<any>} - Result of execution
   */
  async evaluate(code, ...args) {
    throw new Error('Method not implemented: evaluate()');
  }
  
  /**
   * Get the current URL
   * @returns {Promise<string>} - Current URL
   */
  async getCurrentUrl() {
    throw new Error('Method not implemented: getCurrentUrl()');
  }
  
  /**
   * Get the page title
   * @returns {Promise<string>} - Page title
   */
  async getTitle() {
    throw new Error('Method not implemented: getTitle()');
  }
  
  /**
   * Check if element exists
   * @param {string} selector - Element selector or description
   * @returns {Promise<boolean>} - Whether element exists
   */
  async elementExists(selector) {
    throw new Error('Method not implemented: elementExists()');
  }
  
  /**
   * Set proxy configuration
   * @param {Object} proxyConfig - Proxy configuration
   * @returns {Promise<boolean>} - Whether proxy was set successfully
   */
  async setProxy(proxyConfig) {
    throw new Error('Method not implemented: setProxy()');
  }
  
  /**
   * Get or set cookies
   * @param {Object|Array} cookies - Cookies to set, or empty to get
   * @returns {Promise<Array>} - Current cookies
   */
  async cookies(cookies) {
    throw new Error('Method not implemented: cookies()');
  }
  
  /**
   * Load browser extensions
   * @param {string|Array} extensions - Path to extension(s)
   * @returns {Promise<boolean>} - Whether extensions were loaded successfully
   */
  async loadExtensions(extensions) {
    throw new Error('Method not implemented: loadExtensions()');
  }
  
  /**
   * Save current session state (cookies, localStorage, etc.)
   * @param {string} path - Path to save session
   * @returns {Promise<boolean>} - Whether session was saved successfully
   */
  async saveSession(path) {
    throw new Error('Method not implemented: saveSession()');
  }
  
  /**
   * Load a previously saved session
   * @param {string} path - Path to session data
   * @returns {Promise<boolean>} - Whether session was loaded successfully
   */
  async loadSession(path) {
    throw new Error('Method not implemented: loadSession()');
  }
  
  /**
   * Extract structured data from the page (tables, lists, etc.)
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} - Structured data
   */
  async extractStructuredData(options) {
    throw new Error('Method not implemented: extractStructuredData()');
  }
  
  /**
   * Handle browser dialogs (alert, confirm, prompt)
   * @param {string} action - Action to take ('accept', 'dismiss', 'text')
   * @param {string} text - Text to enter (for prompts)
   * @returns {Promise<boolean>} - Whether dialog was handled successfully
   */
  async handleDialog(action, text) {
    throw new Error('Method not implemented: handleDialog()');
  }
  
  /**
   * Monitor network activity
   * @param {Object} options - Monitoring options
   * @returns {Promise<Array>} - Network requests
   */
  async monitorNetwork(options) {
    throw new Error('Method not implemented: monitorNetwork()');
  }
}

module.exports = BrowserInterface; 