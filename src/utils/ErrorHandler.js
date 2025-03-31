/**
 * Enhanced error handling system for browser automation
 * Provides intelligent error categorization, recovery strategies, and suggestions
 */

class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      takeScreenshotOnError: true,
      screenshotDir: './error-screenshots',
      logErrors: true,
      ...options
    };
    
    // Error tracking for analytics
    this.errorStats = {
      total: 0,
      categories: {},
      actions: {}
    };
  }
  
  /**
   * Handle an error by categorizing and applying the appropriate recovery strategy
   * @param {Error} error - The error to handle
   * @param {Object} context - Context for the error (action, target, etc.)
   * @returns {Object} - Result object with error information and recovery suggestions
   */
  handleError(error, context = {}) {
    // Don't re-handle already handled errors
    if (error.__handled) {
      return error;
    }
    
    // Track error stats
    this.errorStats.total++;
    
    // Categorize the error
    const errorCategory = this._categorizeError(error, context);
    
    // Track by category
    this.errorStats.categories[errorCategory] = 
      (this.errorStats.categories[errorCategory] || 0) + 1;
    
    // Track by action
    if (context.action) {
      this.errorStats.actions[context.action] = 
        (this.errorStats.actions[context.action] || 0) + 1;
    }
    
    // Log the error if enabled
    if (this.options.logErrors) {
      console.error(`[${errorCategory}] Error in ${context.action || 'unknown action'}:`, error.message);
    }
    
    // Get recovery strategy
    const recovery = this._getRecoveryStrategy(errorCategory, error, context);
    
    // Construct error result object
    const errorResult = {
      error: true,
      message: error.message,
      category: errorCategory,
      suggestion: recovery.suggestion,
      retry: recovery.canRetry,
      context: {
        action: context.action,
        target: context.target,
        value: context.value
      },
      __handled: true
    };
    
    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
      errorResult.stack = error.stack;
    }
    
    return errorResult;
  }
  
  /**
   * Retry an action with exponential backoff
   * @param {Function} action - Function to retry
   * @param {Object} options - Retry options
   * @returns {Promise<any>} - Result of the action
   */
  async retryWithBackoff(action, options = {}) {
    const retryOptions = {
      maxRetries: this.options.maxRetries,
      initialDelay: this.options.retryDelay,
      maxDelay: 10000,
      factor: 2,
      context: {},
      onError: null,
      ...options
    };
    
    let lastError;
    let delay = retryOptions.initialDelay;
    
    for (let attempt = 1; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        return await action();
      } catch (error) {
        lastError = error;
        
        // Call onError callback if provided
        if (retryOptions.onError) {
          retryOptions.onError(error, attempt, retryOptions.maxRetries);
        }
        
        // Log retry attempt
        console.warn(`Retry attempt ${attempt}/${retryOptions.maxRetries} after error: ${error.message}`);
        
        // If this is the last attempt, don't wait
        if (attempt === retryOptions.maxRetries) {
          break;
        }
        
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Increase delay for next attempt, but don't exceed maxDelay
        delay = Math.min(delay * retryOptions.factor, retryOptions.maxDelay);
      }
    }
    
    // If we get here, all retries have failed
    throw lastError;
  }
  
  /**
   * Get error statistics
   * @returns {Object} - Error statistics
   */
  getErrorStats() {
    return { ...this.errorStats };
  }
  
  /**
   * Reset error statistics
   */
  resetErrorStats() {
    this.errorStats = {
      total: 0,
      categories: {},
      actions: {}
    };
  }
  
  /**
   * Categorize an error based on its message and context
   * @param {Error} error - The error to categorize
   * @param {Object} context - Error context
   * @returns {string} - Error category
   * @private
   */
  _categorizeError(error, context) {
    const message = error.message.toLowerCase();
    
    // Element not found errors
    if (
      message.includes('element not found') ||
      message.includes('no element found') ||
      message.includes('unable to find') ||
      message.includes('element is not attached') ||
      message.includes('could not locate element') ||
      message.includes('element not visible') ||
      message.includes('element not interactable') ||
      message.includes('unclickable') ||
      message.includes('target not found')
    ) {
      return 'ELEMENT_NOT_FOUND';
    }
    
    // Navigation errors
    if (
      message.includes('navigation') ||
      message.includes('timeout') && context.action === 'navigate' ||
      message.includes('net::err') ||
      message.includes('failed to load') ||
      message.includes('navigation timeout') ||
      message.includes('page crash') ||
      message.includes('aborted')
    ) {
      return 'NAVIGATION_ERROR';
    }
    
    // Timeout errors
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('wait') && message.includes('exceeded')
    ) {
      return 'TIMEOUT';
    }
    
    // Authentication errors
    if (
      message.includes('authentication') ||
      message.includes('login') ||
      message.includes('auth') ||
      message.includes('permission') ||
      message.includes('access denied') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not logged in')
    ) {
      return 'AUTHENTICATION_ERROR';
    }
    
    // Page state errors
    if (
      message.includes('detached') ||
      message.includes('stale element') ||
      message.includes('is no longer attached') ||
      message.includes('removed from dom')
    ) {
      return 'PAGE_STATE_ERROR';
    }
    
    // Input errors
    if (
      message.includes('input') ||
      message.includes('value') ||
      message.includes('invalid input') ||
      context.action === 'type' && message.includes('failed')
    ) {
      return 'INPUT_ERROR';
    }
    
    // Browser errors
    if (
      message.includes('browser') ||
      message.includes('chrome') ||
      message.includes('firefox') ||
      message.includes('webkit') ||
      message.includes('chromedriver') ||
      message.includes('geckodriver') ||
      message.includes('webdriver')
    ) {
      return 'BROWSER_ERROR';
    }
    
    // JavaScript execution errors
    if (
      message.includes('execution context') ||
      message.includes('script') ||
      message.includes('evaluate') ||
      message.includes('javascript')
    ) {
      return 'JAVASCRIPT_ERROR';
    }
    
    // Network errors
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('offline') ||
      message.includes('net::') ||
      message.includes('ssl')
    ) {
      return 'NETWORK_ERROR';
    }
    
    // Session errors
    if (
      message.includes('session') ||
      message.includes('cookie') ||
      message.includes('storage')
    ) {
      return 'SESSION_ERROR';
    }
    
    // Security errors
    if (
      message.includes('security') ||
      message.includes('ssl') ||
      message.includes('certificate') ||
      message.includes('blocked') ||
      message.includes('sandbox') ||
      message.includes('cross-origin') ||
      message.includes('cors')
    ) {
      return 'SECURITY_ERROR';
    }
    
    // Default to unknown if no specific category matches
    return 'UNKNOWN_ERROR';
  }
  
  /**
   * Get recovery strategy for an error
   * @param {string} category - Error category
   * @param {Error} error - Original error
   * @param {Object} context - Error context
   * @returns {Object} - Recovery strategy
   * @private
   */
  _getRecoveryStrategy(category, error, context) {
    const strategies = {
      ELEMENT_NOT_FOUND: {
        canRetry: true,
        suggestion: this._getElementNotFoundSuggestion(context)
      },
      
      NAVIGATION_ERROR: {
        canRetry: true,
        suggestion: 'The page could not be loaded. Check the URL, network connection, or try again later.'
      },
      
      TIMEOUT: {
        canRetry: true,
        suggestion: 'The operation timed out. Try increasing the timeout or waiting for the page to be more fully loaded.'
      },
      
      AUTHENTICATION_ERROR: {
        canRetry: false,
        suggestion: 'Authentication is required. Please check your credentials or login status.'
      },
      
      PAGE_STATE_ERROR: {
        canRetry: true,
        suggestion: 'The page structure changed during the operation. Refresh the page and try again.'
      },
      
      INPUT_ERROR: {
        canRetry: true,
        suggestion: 'There was a problem with the input. Check the value and format of your input.'
      },
      
      BROWSER_ERROR: {
        canRetry: false,
        suggestion: 'There was a problem with the browser. Try restarting the automation.'
      },
      
      JAVASCRIPT_ERROR: {
        canRetry: false,
        suggestion: 'JavaScript execution failed. The page may be blocking automation or scripts.'
      },
      
      NETWORK_ERROR: {
        canRetry: true,
        suggestion: 'A network error occurred. Check your internet connection and try again.'
      },
      
      SESSION_ERROR: {
        canRetry: false,
        suggestion: 'There was a problem with the browser session. Try restarting the browser.'
      },
      
      SECURITY_ERROR: {
        canRetry: false,
        suggestion: 'A security restriction prevented the operation. This may be due to CORS, certificates, or site security.'
      },
      
      UNKNOWN_ERROR: {
        canRetry: false,
        suggestion: 'An unexpected error occurred. Check the error message for details.'
      }
    };
    
    return strategies[category] || strategies.UNKNOWN_ERROR;
  }
  
  /**
   * Get a specific suggestion for element not found errors
   * @param {Object} context - Error context
   * @returns {string} - Suggestion
   * @private
   */
  _getElementNotFoundSuggestion(context) {
    if (!context || !context.action) {
      return 'The element could not be found. It may not exist, be hidden, or have changed.';
    }
    
    switch (context.action) {
      case 'click':
        return `Could not find element to click: "${context.target}". Check if the element exists, is visible, or try using a different selector.`;
        
      case 'type':
        return `Could not find input field: "${context.target}". Check the field name or try using a different selector.`;
        
      case 'extract':
        return `Could not find content to extract: "${context.target}". The content may not exist on this page.`;
        
      default:
        return `Could not find element: "${context.target}". Check if the element exists or try using a different identifier.`;
    }
  }
  
  /**
   * Take a screenshot to help diagnose errors
   * @param {Object} browser - Browser instance
   * @param {string} errorId - Unique error identifier
   * @returns {Promise<string|null>} - Path to the screenshot
   * @private
   */
  async _takeErrorScreenshot(browser, errorId) {
    if (!this.options.takeScreenshotOnError || !browser) {
      return null;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Ensure screenshot directory exists
      if (!fs.existsSync(this.options.screenshotDir)) {
        fs.mkdirSync(this.options.screenshotDir, { recursive: true });
      }
      
      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `error-${errorId}-${timestamp}.png`;
      const screenshotPath = path.join(this.options.screenshotDir, filename);
      
      // Take screenshot using the browser
      if (browser.screenshot) {
        await browser.screenshot(screenshotPath);
      } else if (browser.browserController && browser.browserController.screenshot) {
        await browser.browserController.screenshot(screenshotPath);
      } else if (browser.page && browser.page.screenshot) {
        await browser.page.screenshot({ path: screenshotPath });
      } else {
        return null;
      }
      
      return screenshotPath;
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError);
      return null;
    }
  }
}

module.exports = ErrorHandler; 