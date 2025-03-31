const BrowserController = require('./BrowserController');
const NLPProcessor = require('./NLPProcessor');
const config = require('./config/config');
const ErrorHandler = require('./utils/ErrorHandler');
const searchHelper = require('../kaggle_search_helper');
const { OpenAI } = require('openai');
const BrowserFactory = require('./browsers/BrowserFactory');
const ExtractAPI = require('./extraction/ExtractAPI');

/**
 * InteractAPI class provides the main interface for browser automation
 * It combines browser control with natural language processing
 */
class InteractAPI {
  constructor(options = {}) {
    this.options = {
      ...config,
      ...options,
    };
    this.browserController = new BrowserController(this.options);
    this.nlp = new NLPProcessor(this.options);
    this.errorHandler = new ErrorHandler();
    this.isInitialized = false;
    this.commandHistory = [];
    this.config = config;
    
    // Initialize OpenAI if API key is available
    if (this.config.openai && this.config.openai.apiKey) {
      try {
        this.openai = new OpenAI({
          apiKey: this.config.openai.apiKey,
        });
        console.log('OpenAI client initialized with API key');
      } catch (error) {
        console.warn('Failed to initialize OpenAI client:', error.message);
        this.openai = null;
      }
    } else {
      console.warn('OpenAI API key not found in config, AI parsing will be unavailable');
      this.openai = null;
    }
  }

  /**
   * Initialize the API
   */
  async initialize() {
    try {
      // Try initialization
      console.log('Initializing browser with options:', JSON.stringify(this.options, null, 2));
      
      // Create browser instance using the factory
      this.browserController = await BrowserFactory.createBrowser({
        browserType: this.options.browser?.defaultBrowser || 'auto',
        useNative: this.options.useNative === true,
        headless: this.options.browser?.headless !== false,
        viewport: this.options.browser?.viewport,
        slowMo: this.options.browser?.slowMo || 0,
        timeout: this.options.browser?.timeout || 30000,
        extraArgs: this.options.browser?.args || []
      });
      
      // Initialize browser
      const result = await this.browserController.initialize();
      
      // Initialize extraction API
      this.extractionAPI = new ExtractAPI(this.browserController);
      
      if (this.browserController.isInitialized) {
        this.isInitialized = true;
        console.log('Browser has been successfully initialized and is ready for commands.');
        return true;
      } else {
        throw new Error('Failed to initialize browser.');
      }
    } catch (error) {
      console.error('Failed to initialize InteractAPI:', error);
      throw error;
    }
  }

  /**
   * Execute a natural language command
   */
  async executeCommand(command) {
    if (!this.isInitialized) {
      throw new Error('InteractAPI is not initialized. Call initialize() first.');
    }
    
    try {
      // Add to command history
      this.commandHistory.push(command);
      
      // Special case for "sign in with email" command
      if (command.toLowerCase().includes('sign in with email') || 
          command.toLowerCase().includes('login with email') ||
          command.toLowerCase() === 'click-email-option') {
        console.log('Detected request to click email sign-in option...');
        if (typeof this.browserController.clickKaggleEmailSignIn === 'function') {
          console.log('Using specialized method to click email sign-in option');
          const result = await this.browserController.clickKaggleEmailSignIn();
          return {
            success: result,
            message: result ? 'Successfully clicked email sign-in option' : 'Failed to click email sign-in option'
          };
        } else {
          console.log('Using regular click method for email sign-in option');
          return await this.browserController.click('sign in with email');
        }
      }
      
      // Special case for "click-signin" command
      if (command.toLowerCase() === 'click-signin') {
        console.log('Detected request to click sign-in button...');
        if (typeof this.browserController.findAndClickSignInLink === 'function') {
          console.log('Using specialized method to click sign-in button');
          const result = await this.browserController.findAndClickSignInLink();
          return {
            success: result,
            message: result ? 'Successfully clicked sign-in button' : 'Failed to click sign-in button'
          };
        } else {
          console.log('Using regular click method for sign-in button');
          return await this.browserController.click('sign in');
        }
      }
      
      // Special case for search commands
      if (command.toLowerCase().startsWith('search for ') || 
          command.toLowerCase().includes('search kaggle for ')) {
        
        console.log('Detected direct search command');
        let searchTerm = '';
        
        // Extract search term after "search for "
        if (command.toLowerCase().startsWith('search for ')) {
          searchTerm = command.substring('search for '.length).trim();
        } 
        // Extract search term after "search kaggle for "
        else if (command.toLowerCase().includes('search kaggle for ')) {
          searchTerm = command.split('search kaggle for ')[1].trim();
        }
        
        // Remove quotes if present
        searchTerm = searchTerm.replace(/["']/g, '');
        
        console.log(`Using direct search URL for: "${searchTerm}"`);
        
        if (searchTerm) {
          return await this.directSearchKaggle(searchTerm);
        }
      }
      
      // Special case for Kaggle login commands
      if (command.toLowerCase().includes('login') && command.toLowerCase().includes('kaggle')) {
        console.log('Detected Kaggle login command');
        return await this.performKaggleLogin();
      }
      
      // Special case for credentials command
      if (command.toLowerCase().includes('credential') || 
          command.toLowerCase().includes('username') || 
          command.toLowerCase().includes('password') || 
          command.toLowerCase().includes('.env') ||
          command.toLowerCase().includes('sign in with') ||
          command.toLowerCase().includes('login with')) {
        
        console.log('Detected credential request, handling Kaggle login with stored credentials...');
        
        // First check if we're on Kaggle
        if (this.browserController.currentUrl?.includes('kaggle.com')) {
          return await this.performKaggleLogin();
        } else {
          return {
            error: true,
            message: 'Not on a login page. Navigate to a login page first.'
          };
        }
      }
      
      // Keep existing search command fallbacks for backward compatibility
      // Special case for search commands on Kaggle
      if (this.browserController.currentUrl?.includes('kaggle.com') && 
          (command.toLowerCase().includes('search') || 
           (command.toLowerCase().includes('type') && 
            (command.toLowerCase().includes('search box') || 
             command.toLowerCase().includes('search bar'))))) {
        
        console.log('Detected legacy Kaggle search command, extracting search term...');
        
        // Extract the search term
        let searchTerm = '';
        
        // Use more reliable direct search for commands that start with search
        if (command.toLowerCase().includes('search for ')) {
          searchTerm = command.split('search for ')[1].trim();
          console.log(`Switching to direct search URL for: "${searchTerm}"`);
          return await this.directSearchKaggle(searchTerm);
        } else if (command.toLowerCase().includes('search ')) {
          searchTerm = command.split('search ')[1].trim();
          console.log(`Switching to direct search URL for: "${searchTerm}"`);
          return await this.directSearchKaggle(searchTerm);
        } else if (command.toLowerCase().includes('type ') && command.toLowerCase().includes(' in')) {
          // Fixed: Extract everything between "type" and last occurrence of " in"
          const typeCommand = command.toLowerCase();
          const typeIndex = typeCommand.indexOf('type ') + 5;
          const inIndex = typeCommand.lastIndexOf(' in ');
          
          if (typeIndex > 4 && inIndex > typeIndex) {
            searchTerm = command.substring(typeIndex, inIndex).trim();
          } else {
            // Fallback: Extract using a more specific pattern
            const match = command.match(/type\s+(.*?)\s+in\s+(?:the\s+)?(?:search\s*(?:box|bar|field)|input)/i);
            if (match && match[1]) {
              searchTerm = match[1].trim();
            }
          }
        } else if (command.toLowerCase().includes('type ')) {
          // Get everything after "type"
          searchTerm = command.split('type ')[1].trim();
          
          // If there are more instructions after the search term, extract just the term
          if (searchTerm.includes(' in ')) {
            searchTerm = searchTerm.split(' in ')[0].trim();
          }
        }
        
        // Remove quotes if present
        searchTerm = searchTerm.replace(/["']/g, '');
        
        console.log(`Extracted search term: "${searchTerm}"`);
        
        if (searchTerm) {
          // Use direct search navigation instead of UI interaction
          console.log(`Using direct URL search for legacy command with term: "${searchTerm}"`);
          return await this.directSearchKaggle(searchTerm);
        }
      }
      
      // Process the command using NLP
      const parsedCommand = await this.nlp.processCommand(command);
      console.log('Parsed command:', JSON.stringify(parsedCommand, null, 2));
      
      if (!parsedCommand || !parsedCommand.action) {
        throw new Error('Could not parse command');
      }
      
      // Execute the parsed command
      return await this.executeAction(parsedCommand);
    } catch (error) {
      return this.errorHandler.handleError(error, command);
    }
  }

  /**
   * Special handling for Kaggle login process
   */
  async handleKaggleLogin() {
    console.log('Handling Kaggle login process...');
    
    if (!this.config.kaggle.username || !this.config.kaggle.password) {
      console.error('Kaggle credentials not found in .env file. Please add KAGGLE_USERNAME and KAGGLE_PASSWORD to your .env file.');
      return false;
    }
    
    try {
      // Wait for the login form to load properly
      await this.browserController.wait(2000);
      
      // Take a screenshot for debugging
      await this.browserController.takeDebugScreenshot('kaggle-login-form', 'test_images');
      
      console.log('Using direct JavaScript injection to fill credentials');
      
      // Inject credentials directly using JavaScript
      const loginResult = await this.browserController.page.evaluate(
        ({ username, password }) => {
          try {
            // Log helpful debug info
            console.log(`Found ${document.querySelectorAll('input').length} input fields`);
            document.querySelectorAll('input').forEach((input, i) => {
              console.log(`Input ${i}: type=${input.type}, id=${input.id}, name=${input.name}, placeholder=${input.placeholder || 'none'}`);
            });
            
            // Find email input - use very generic selector first
            let emailInput = document.querySelector('input[type="email"], input[type="text"]');
            if (!emailInput) {
              console.log('No email input found with standard selectors, trying broader approach');
              // Broader approach - find any input not password type
              const inputs = Array.from(document.querySelectorAll('input')).filter(i => i.type !== 'password');
              if (inputs.length > 0) emailInput = inputs[0];
            }
            
            if (!emailInput) {
              console.log('Could not find email field');
              return false;
            }
            
            // Find password input
            const passwordInput = document.querySelector('input[type="password"]');
            if (!passwordInput) {
              console.log('Could not find password field');
              return false;
            }
            
            // Enter credentials
            console.log('Found login fields, entering credentials');
            
            // Email
            emailInput.value = username;
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            emailInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Password
            passwordInput.value = password;
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Find login/submit button
            const submitButton = document.querySelector(
              'button[type="submit"], input[type="submit"], button:contains("Sign in"), button:contains("Log in")'
            );
            
            if (submitButton) {
              console.log('Found submit button, clicking');
              submitButton.click();
              return true;
            } else {
              // If no button, try submitting the form
              console.log('No submit button found, trying to submit form');
              const form = emailInput.closest('form');
              if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true }));
                return true;
              }
              
              // Last resort - press Enter on password field
              console.log('No form found, dispatching Enter keydown event');
              passwordInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
              return true;
            }
          } catch (e) {
            console.error('Error during login:', e);
            return false;
          }
        },
        { 
          username: this.config.kaggle.username, 
          password: this.config.kaggle.password 
        }
      );
      
      if (loginResult) {
        console.log('Successfully filled and submitted login form');
        // Wait for navigation
        await this.browserController.wait(5000);
        
        // Final verification screenshot
        await this.browserController.takeDebugScreenshot('after-submission', 'test_images');
        
        // Verify if login was successful
        const loginSuccessful = await this.browserController.page.evaluate(() => {
          // Check for successful login indicators
          const successIndicators = [
            // User profile elements
            document.querySelector('img.avatar'),
            document.querySelector('.user-profile'),
            document.querySelector('[data-testid="UserMenuButton"]'),
            
            // Redirect to dashboard/home
            window.location.pathname === '/' || 
            window.location.pathname.includes('/home') ||
            window.location.pathname.includes('/dashboard'),
            
            // Not on login page anymore
            !window.location.pathname.includes('/login')
          ];
          
          // Check if any indicators are true
          const loggedIn = successIndicators.some(indicator => !!indicator);
          
          // Also check if we're still at login form
          const stillAtLoginForm = document.querySelector('input[type="email"], input[type="text"]') &&
                                   document.querySelector('input[type="password"]');
          
          return {
            loggedIn,
            stillAtLoginForm,
            url: window.location.href,
            path: window.location.pathname
          };
        });
        
        console.log('Login verification result:', JSON.stringify(loginSuccessful));
        
        if (loginSuccessful && loginSuccessful.loggedIn) {
          console.log('✅ Login successful! User is now logged in to Kaggle.');
          return true;
        } else {
          console.log('⚠️ Login might have failed. Current URL:', loginSuccessful.url);
          
          // Still on login page or showing login form, login failed
          if (loginSuccessful.stillAtLoginForm || loginSuccessful.url.includes('login')) {
            console.log('CRITICAL ERROR: Still on login page, login failed - will retry with direct method');
            // Try one more time with direct method
            return await this.fillKaggleCredentials();
          } else {
            console.log('⚠️ Not on login page but login indicators not found. May have partially succeeded.');
          }
        }
        
        console.log('Kaggle login process completed');
        return true;
      }
      
      // Fallback to old method if direct injection fails
      console.log('JavaScript login injection failed, falling back to typing method');
      
      // More direct approach for fields
      try {
        // Type email
        await this.browserController.page.fill('input[type="email"], input[type="text"]', this.config.kaggle.username);
        console.log('Filled email field');
        
        await this.browserController.wait(500);
        
        // Type password
        await this.browserController.page.fill('input[type="password"]', this.config.kaggle.password);
        console.log('Filled password field');
        
        await this.browserController.wait(500);
        
        // Click submit or press Enter
        const submitButton = await this.browserController.page.$('button[type="submit"], input[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          console.log('Clicked submit button');
        } else {
          await this.browserController.pressEnter();
          console.log('Pressed Enter to submit login');
        }
        
        await this.browserController.wait(5000);
        return true;
      } catch (fallbackError) {
        console.error('Fallback login method failed:', fallbackError.message);
      }
      
      // If all else fails, use the tabbing approach
      console.log('Trying tab-based navigation as last resort');
      await this.browserController.page.keyboard.press('Tab'); // Focus first input
      await this.browserController.wait(500);
      await this.browserController.page.keyboard.type(this.config.kaggle.username);
      
      await this.browserController.wait(500);
      await this.browserController.page.keyboard.press('Tab'); // Move to password
      await this.browserController.wait(500);
      await this.browserController.page.keyboard.type(this.config.kaggle.password);
      
      await this.browserController.wait(500);
      await this.browserController.pressEnter();
      
      // Wait for navigation
      await this.browserController.wait(5000);
      
      // Take a final screenshot
      await this.browserController.takeDebugScreenshot('kaggle-login-result', 'test_images');
      
      console.log('Kaggle login process completed');
      return true;
    } catch (error) {
      console.error('Error during Kaggle login:', error);
      return false;
    }
  }

  /**
   * Execute a specific action
   */
  async executeAction(action) {
    if (!this.isInitialized) {
      if (action.action !== 'initialize') {
        throw new Error('API not initialized. Call initialize() first.');
      }
    }
    
    try {
      console.log(`Executing action: ${action.action} ${action.target || ''} ${action.value || ''}`);
      
      switch (action.action.toLowerCase()) {
        case 'navigate':
          return await this.browserController.navigate(action.target);
        
        case 'execute_predefined':
          console.log(`The command '${action.target}' will be handled directly by the CLI`);
          
          // Since we're now handling command mapping at the CLI level,
          // we'll just execute the original command directly
          return await this.executeCommand(action.target);
        
        case 'click':
          const clickResult = await this.browserController.click(action.target);
          
          // Special handling for Kaggle login
          if (clickResult && 
              this.browserController.currentUrl && 
              this.browserController.currentUrl.includes('kaggle.com')) {
              
            // Always wait a moment after clicking anything on Kaggle
            await this.browserController.wait(2000);
            
            // DO NOT automatically proceed with login - wait for user commands instead
            console.log('Clicked successfully. What would you like to do next?');
            
            // If this was explicitly a click on "sign in with email" button
            if (action.target.toLowerCase().includes('email')) {
              console.log('You clicked the sign in with email button. Use the "fill credentials" command to enter username and password.');
            }
          }
          
          return clickResult;
        
        case 'type':
          return await this.browserController.type(action.target, action.value);
        
        case 'extract':
          return await this.extract(action.target);
        
        case 'wait':
          const waitTime = parseInt(action.value, 10) || 1000;
          return await this.browserController.wait(waitTime);
        
        case 'screenshot':
          return await this.browserController.screenshot(action.value || 'screenshot.png');
        
        case 'press':
          if (action.target.toLowerCase() === 'enter') {
            return await this.browserController.pressEnter();
          }
          // Add more key press options as needed
          throw new Error(`Unsupported key: ${action.target}`);
          
        case 'search':
          // If we're on Kaggle, use the direct search URL navigation
          if (this.browserController.currentUrl?.includes('kaggle.com')) {
            return await this.directSearchKaggle(action.target);
          } else {
            // For other sites, implement a generic search method
            return await this.browserController.type('search', action.target);
          }
        
        case 'initialize':
          return await this.initialize();
        
        case 'click_result':
          const resultNumber = parseInt(action.target, 10) || 1; // Default to first result
          return await this.clickSearchResult(resultNumber);
        
        case 'show_results':
        case 'extract_results':
          return await this.extractSearchResults();
          
        // New show_result action to show a specific result
        case 'show_result':
          const resultToShow = parseInt(action.target, 10) || 1;
          // Use AI if available
          if (this.openai) {
            return await this.parseSpecificResultWithAI(resultToShow);
          } else {
            return await this.displaySpecificResult(resultToShow);
          }
          
        // AI-specific actions
        case 'analyze_page':
          return await this.extract('page content', true);
          
        case 'analyze_results':
          return await this.parseKaggleSearchWithAI();
          
        case 'analyze_result':
          const targetResult = parseInt(action.target, 10) || 1;
          return await this.parseSpecificResultWithAI(targetResult);
        
        default:
          throw new Error(`Unknown action: ${action.action}`);
      }
    } catch (error) {
      return this.errorHandler.handleError(error, action);
    }
  }
  
  /**
   * Specialized method to search on Kaggle
   */
  async searchKaggle(searchTerm) {
    console.log(`Performing Kaggle search for: "${searchTerm}"`);
    
    try {
      // First check if we're on Kaggle
      if (!this.browserController.currentUrl?.includes('kaggle.com')) {
        console.log('Not on Kaggle.com - navigating there first');
        await this.browserController.navigate('https://kaggle.com');
        await this.browserController.wait(3000);
      }
      
      // Use the browser controller's specialized Kaggle search method
      const searchResult = await this.browserController.searchKaggle(searchTerm);
      
      if (searchResult) {
        console.log('Kaggle search completed successfully');
        return true;
      } else {
        console.error('Kaggle search failed');
        return false;
      }
    } catch (error) {
      console.error('Error during Kaggle search:', error);
      return false;
    }
  }

  /**
   * Close the browser and clean up
   */
  async close() {
    if (this.browserController) {
      await this.browserController.close();
    }
    this.isInitialized = false;
  }

  /**
   * Set Kaggle credentials directly
   */
  setKaggleCredentials(username, password) {
    this.config.kaggle.username = username;
    this.config.kaggle.password = password;
    console.log('Kaggle credentials updated for this session');
    return true;
  }

  /**
   * Handle Kaggle login with debugging
   */
  async performKaggleLogin() {
    // Check if on Kaggle
    if (!this.browserController.currentUrl?.includes('kaggle.com')) {
      console.log('Not on Kaggle.com - navigating there first');
      await this.browserController.navigate('https://kaggle.com');
    }
    
    // Check if logged in already
    const isLoggedIn = await this.browserController.page.evaluate(() => {
      const userMenu = document.querySelector('img.avatar');
      return !!userMenu;
    });
    
    if (isLoggedIn) {
      console.log('Already logged in to Kaggle');
      return true;
    }
    
    // Log credential status
    if (!this.config.kaggle.username || !this.config.kaggle.password) {
      console.error('⚠️ Missing Kaggle credentials - please set them in .env file:');
      console.error('KAGGLE_USERNAME=your_username');
      console.error('KAGGLE_PASSWORD=your_password');
      return false;
    } else {
      console.log('Found Kaggle credentials, logging in...');
      console.log(`Using username: ${this.config.kaggle.username.slice(0, 2)}${'*'.repeat(Math.max(0, this.config.kaggle.username.length - 4))}${this.config.kaggle.username.slice(-2)}`);
    }
    
    // Check if we need to click Sign In button
    const needsSignIn = await this.browserController.page.evaluate(() => {
      // Look for sign in link
      const signInLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => a.innerText && a.innerText.toLowerCase().includes('sign in'));
      return signInLinks.length > 0;
    });
    
    if (needsSignIn) {
      console.log('Clicking Sign In button...');
      await this.browserController.click('sign in');
      await this.browserController.wait(3000);
    }
    
    // Check if we're on the auth options page
    const needsEmailOption = await this.browserController.page.evaluate(() => {
      return document.body.innerText.toLowerCase().includes('sign in with email');
    });
    
    if (needsEmailOption) {
      console.log('Clicking "Sign in with Email" option...');
      const emailResult = await this.browserController.clickKaggleEmailSignIn();
      if (!emailResult) {
        console.error('Failed to click email sign-in option');
        return false;
      }
      await this.browserController.wait(2000);
    }
    
    // Now we should be on the login form page - handle the login
    console.log('Filling login form with credentials using PASSWORD FIRST approach...');
    // Use our password-first approach instead of the old handleKaggleLogin method
    const loginResult = await this.fillKaggleCredentials();
    
    if (loginResult) {
      console.log('Successfully logged in to Kaggle!');
      return true;
    } else {
      console.error('Login process failed');
      return false;
    }
  }

  /**
   * Direct method to fill Kaggle credentials with PASSWORD FIRST approach
   * @param {string} mode - Optional mode: 'username-only', 'password-only', or undefined for both
   */
  async fillKaggleCredentials(mode) {
    console.log(`Filling Kaggle credentials directly with ${mode || 'PASSWORD FIRST'} approach...`);
    
    if (!this.config.kaggle.username || !this.config.kaggle.password) {
      console.error('Kaggle credentials not found in .env file. Please add KAGGLE_USERNAME and KAGGLE_PASSWORD to your .env file.');
      return false;
    }
    
    try {
      // Try to take a screenshot but don't fail if method is missing
      try {
        if (typeof this.browserController.takeDebugScreenshot === 'function') {
          await this.browserController.takeDebugScreenshot('before-fill-credentials', 'test_images');
        } else {
          console.log('Screenshot function not available, continuing without taking screenshots');
        }
      } catch (screenshotError) {
        console.log('Screenshot error (non-critical):', screenshotError.message);
      }
      
      if (mode === 'username-only') {
        // Only fill the username field
        await this.browserController.page.fill('input[type="email"], input[type="text"]', this.config.kaggle.username);
        console.log('Filled username field with Playwright API');
        return true;
      } else if (mode === 'password-only') {
        // Only fill the password field
        await this.browserController.page.fill('input[type="password"]', this.config.kaggle.password);
        console.log('Filled password field with Playwright API');
        return true;
      } else {
        // Skip all other approaches and go straight to the password-first method
        console.log('Using password-first approach to fill both fields...');
        return await this.directFillBothFields();
      }
    } catch (error) {
      console.error('Error filling Kaggle credentials:', error);
      
      // Fallback to simple direct filling
      console.log('Trying simple direct fill as fallback...');
      try {
        // Fill password FIRST (important for React form)
        await this.browserController.page.fill('input[type="password"]', this.config.kaggle.password);
        console.log('Filled password field directly');
        
        // Then fill username
        await this.browserController.page.fill('input[type="email"], input[type="text"]', this.config.kaggle.username);
        console.log('Filled username field directly');
        
        return true;
      } catch (fallbackError) {
        console.error('Even simple direct fill failed:', fallbackError.message);
        return false;
      }
    }
  }
  
  /**
   * Simplified method to directly fill both fields in the right order
   */
  async directFillBothFields() {
    console.log('Directly filling both fields with password first...');
    
    try {
      // Fill the fields with direct JavaScript approach - password FIRST, then username
      const result = await this.browserController.page.evaluate(({ username, password }) => {
        try {
          // Find the fields
          const emailField = document.querySelector('input[type="email"], input[type="text"]');
          const passwordField = document.querySelector('input[type="password"]');
          
          if (!emailField || !passwordField) {
            return { success: false, error: 'Fields not found' };
          }
          
          // STEP 1: Focus and fill PASSWORD FIELD FIRST
          passwordField.focus();
          passwordField.value = password;
          passwordField.dispatchEvent(new Event('input', { bubbles: true }));
          passwordField.dispatchEvent(new Event('change', { bubbles: true }));
          
          // STEP 2: Fill username WITHOUT focusing first
          emailField.value = username;
          emailField.dispatchEvent(new Event('input', { bubbles: true }));
          emailField.dispatchEvent(new Event('change', { bubbles: true }));
          
          return { 
            success: true, 
            passwordSet: passwordField.value === password,
            usernameSet: emailField.value === username
          };
        } catch (error) {
          return { success: false, error: error.toString() };
        }
      }, {
        username: this.config.kaggle.username,
        password: this.config.kaggle.password
      });
      
      console.log('Fill result:', JSON.stringify(result));
      
      if (result.success) {
        console.log('✓ Both fields filled successfully');
        
        // Press Enter to submit if both fields are filled
        if (result.passwordSet && result.usernameSet) {
          console.log('Pressing Enter to submit form...');
          await this.browserController.pressEnter();
          await this.browserController.wait(3000);
        }
        
        return true;
      } else {
        console.error('Failed to fill fields:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error in directFillBothFields:', error.message);
      return false;
    }
  }

  /**
   * Click on a specific search result by its number/index
   * @param {number} resultNumber - The 1-based index of the result to click
   */
  async clickSearchResult(resultNumber) {
    console.log(`\n=== CLICKING SEARCH RESULT #${resultNumber} ===\n`);
    
    // Make sure we're on a search page
    if (!this.browserController.currentUrl?.includes('search')) {
      console.log('Not currently on a search page.');
      console.log('Please navigate to a search page and perform a search first.');
      console.log('Suggested commands:');
      console.log('  > search for [term]');
      console.log('  > kaggle-search [term]');
      return false;
    }
    
    // Optional: Extract search results first to see what's available
    const searchData = await this.extractSearchResults();
    if (!searchData || !searchData.count || searchData.count === 0) {
      console.log('No search results found on this page to click.');
      return false;
    }
    
    // Check if resultNumber is valid
    if (resultNumber < 1 || resultNumber > searchData.count) {
      console.log(`Invalid result number ${resultNumber}. Available results: 1-${searchData.count}`);
      return false;
    }
    
    console.log(`Attempting to click on search result #${resultNumber} of ${searchData.count}...`);
    
    // Try multiple methods to click the result
    
    // Method 1: Use searchHelper if available
    if (searchHelper) {
      try {
        console.log('Using search helper module to click result...');
        const success = await searchHelper.clickKaggleSearchResult(this.browserController.page, resultNumber);
        
        if (success) {
          console.log(`✅ Successfully clicked search result #${resultNumber}`);
          
          // Wait for navigation
          await this.browserController.wait(3000);
          
          // Take screenshot for verification
          await this.browserController.takeDebugScreenshot('after-click-result', 'test_images');
          
          return true;
        } else {
          console.log('❌ Search helper method failed, trying alternative approaches...');
        }
      } catch (error) {
        console.log(`Search helper error: ${error.message}`);
        console.log('Trying alternative approaches...');
      }
    }
    
    // Method 2: Try using the direct result data from our extraction
    try {
      if (searchData.results && searchData.results[resultNumber - 1]) {
        const result = searchData.results[resultNumber - 1];
        
        // If the result has a link, try to navigate directly to it
        if (result.link) {
          console.log(`Found direct link: ${result.link}`);
          console.log('Navigating directly to the result page...');
          
          await this.browserController.navigate(result.link);
          console.log('✅ Successfully navigated to the result page via direct link');
          return true;
        }
      }
    } catch (directError) {
      console.log(`Direct navigation error: ${directError.message}`);
    }
    
    // Method 3: Try using CSS selectors
    try {
      console.log('Trying to click result using CSS selectors...');
      
      // Common selectors for search results
      const selectors = [
        `.mdc-card:nth-child(${resultNumber})`,
        `.mdc-list-item:nth-child(${resultNumber})`,
        `[data-testid="search-results"] > div:nth-child(${resultNumber})`,
        `[role="listitem"]:nth-child(${resultNumber})`,
        // More generic selectors that might work across different sites
        `.search-result:nth-child(${resultNumber})`,
        `.result:nth-child(${resultNumber})`
      ];
      
      for (const selector of selectors) {
        try {
          console.log(`Trying selector: ${selector}`);
          
          // Check if element exists
          const element = await this.browserController.page.$(selector);
          if (element) {
            // Check if clickable
            const clickable = await element.$('a');
            if (clickable) {
              await clickable.click();
              console.log(`✅ Clicked link inside element with selector: ${selector}`);
            } else {
              await element.click();
              console.log(`✅ Clicked element with selector: ${selector}`);
            }
            
            // Wait for navigation
            await this.browserController.wait(3000);
            await this.browserController.takeDebugScreenshot('after-selector-click', 'test_images');
            return true;
          }
        } catch (err) {
          console.log(`Failed with selector ${selector}: ${err.message}`);
        }
      }
    } catch (selectorError) {
      console.log(`Selector approach error: ${selectorError.message}`);
    }
    
    // Method 4: JavaScript evaluation approach
    try {
      console.log('Using JavaScript approach to find and click the result...');
      
      const jsResult = await this.browserController.page.evaluate((index) => {
        try {
          console.log(`JS: Looking for result #${index} on the page...`);
          
          // Find all possible search result containers
          const selectors = [
            '.mdc-card', '.mdc-list-item', 
            '[data-testid="search-results"] > div', 
            '[role="listitem"]',
            '.search-results li', '.search-results-item'
          ];
          
          let items = [];
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements && elements.length > 0) {
              items = Array.from(elements);
              console.log(`JS: Found ${items.length} results with selector: ${selector}`);
              break;
            }
          }
          
          // If no specific selectors worked, try to find all cards/items with similar structure
          if (items.length === 0) {
            items = Array.from(document.querySelectorAll('div.card, div.item, div[role="listitem"], div.search-item'));
            console.log(`JS: Found ${items.length} items with generic card/item selectors`);
          }
          
          // If still nothing, look for any clickable elements that might be results
          if (items.length === 0) {
            const clickables = Array.from(document.querySelectorAll('a, button, [role="button"]'))
              .filter(el => el.offsetParent !== null); // Only visible elements
            console.log(`JS: Found ${clickables.length} clickable elements`);
            
            // Try to find clickables that look like search results
            items = clickables.filter(el => {
              const text = el.textContent.toLowerCase();
              return text.length > 20; // Longer text is more likely to be a result
            });
            console.log(`JS: Filtered to ${items.length} potential result items`);
          }
          
          // Check if the index is valid
          if (index <= 0 || index > items.length) {
            return { 
              success: false, 
              error: `Index ${index} out of range (1-${items.length})`,
              count: items.length
            };
          }
          
          // Get the target item (adjust for 0-based index)
          const item = items[index - 1];
          console.log(`JS: Selected item #${index}: ${item.tagName} with content length: ${item.textContent.length}`);
          
          // Try to find a link to click
          const link = item.querySelector('a') || item.closest('a');
          if (link) {
            const href = link.href;
            link.click();
            return { success: true, method: 'link', href: href };
          }
          
          // If no link, try to find a button
          const button = item.querySelector('button') || item.closest('button');
          if (button) {
            button.click();
            return { success: true, method: 'button' };
          }
          
          // Otherwise click the item itself
          item.click();
          return { success: true, method: 'element' };
        } catch (e) {
          return { success: false, error: e.toString() };
        }
      }, resultNumber);
      
      console.log('JavaScript evaluation result:', jsResult);
      
      if (jsResult.success) {
        console.log(`✅ Successfully clicked result #${resultNumber} using JavaScript (${jsResult.method})`);
        
        // Wait for navigation
        await this.browserController.wait(3000);
        await this.browserController.takeDebugScreenshot('after-js-click', 'test_images');
        return true;
      } else if (jsResult.count) {
        console.log(`Found ${jsResult.count} results but failed to click #${resultNumber}: ${jsResult.error}`);
      }
    } catch (jsError) {
      console.log(`JavaScript approach error: ${jsError.message}`);
    }
    
    console.log('❌ All methods to click the search result failed.');
    console.log('Suggestions:');
    console.log('1. Try extracting results first with "show-results" to see available results');
    console.log('2. Try a different result number');
    console.log('3. Try refreshing the page and searching again');
    
    return false;
  }

  /**
   * Extract content from the page and parse it with AI if available
   * @param {string} target - What to extract (e.g., 'text', 'heading', 'page content', etc.)
   * @param {boolean} useAI - Whether to use AI to parse the content
   * @returns {Promise<string>} - Extracted content
   */
  async extract(target, useAI = false) {
    if (!this.browserController) {
      throw new Error('Browser controller not initialized');
    }
    
    console.log(`Extracting content: ${target}`);
    
    // If this is a search-related extraction and we're on a search page, use our new formatter
    const isSearchContent = 
      target.includes('search') || 
      target.includes('result') || 
      target === 'page content';
    
    const currentUrl = await this.browserController.page.url();
    const isSearchPage = currentUrl.includes('/search');
    
    if (isSearchContent && isSearchPage) {
      console.log('Detected search page content request, using formatted display...');
      
      if (useAI && this.openai) {
        return await this.parseKaggleSearchWithAI();
      } else {
        return await this.displayFormattedSearchResults();
      }
    }
    
    // For non-search content or non-search pages, use the regular extraction logic
    // Determine the content type based on the target
    let contentType = 'full';
    
    // Map natural language targets to content types
    if (target.includes('heading') || target.includes('title')) {
      contentType = 'headings';
    } else if (target.includes('link')) {
      contentType = 'links';
    } else if (target.includes('list')) {
      contentType = 'lists';
    } else if (target.includes('table')) {
      contentType = 'tables';
    } else if (target.includes('search') || target.includes('result')) {
      contentType = 'search-results';
    } else if (target === 'text' || target.includes('raw')) {
      contentType = 'text';
    } else if (target.includes('main')) {
      contentType = 'main';
    }
    
    // Extract the content using our enhanced method
    const content = await this.browserController.extractPageContent(contentType);
    
    // If requested and available, use AI to parse the content
    if (useAI && this.openai) {
      return await this.parseContentWithAI(content);
    }
    
    // Format the content for display
    this._formatAndDisplayContent(content);
    
    return content;
  }
  
  /**
   * Format and display extracted content in a readable way
   * @param {Object} content - The structured content
   * @private
   */
  _formatAndDisplayContent(content) {
    if (!content || content.error) {
      console.error('Error extracting content:', content?.error || 'Unknown error');
      return;
    }
    
    console.log('\n==== PAGE CONTENT EXTRACTION ====\n');
    
    // Format based on content type
    switch (content.type) {
      case 'headings':
        console.log('PAGE HEADINGS:');
        content.headings.forEach(h => {
          const indent = '  '.repeat(h.level - 1);
          console.log(`${indent}${h.level}. ${h.text}`);
        });
        break;
        
      case 'links':
        console.log('PAGE LINKS:');
        content.links.forEach((link, i) => {
          console.log(`[${i + 1}] ${link.text}`);
          console.log(`    URL: ${link.href}`);
        });
        break;
        
      case 'lists':
        console.log('LISTS:');
        content.lists.forEach((list, i) => {
          console.log(`\nList ${i + 1} (${list.type}):`);
          list.items.forEach((item, j) => {
            const marker = list.type === 'ordered' ? `${j + 1}.` : '•';
            console.log(`  ${marker} ${item}`);
          });
        });
        break;
        
      case 'tables':
        console.log('TABLES:');
        content.tables.forEach((table, i) => {
          console.log(`\nTable ${i + 1}:`);
          
          if (table.headers.length > 0) {
            console.log(`  Headers: ${table.headers.join(' | ')}`);
            console.log(`  ${'='.repeat(50)}`);
          }
          
          table.rows.forEach((row, j) => {
            console.log(`  Row ${j + 1}: ${row.join(' | ')}`);
          });
        });
        break;
        
      case 'search_results':
        if (content.isSearchPage && content.searchResults?.length > 0) {
          console.log('SEARCH RESULTS:');
          content.searchResults.forEach(result => {
            console.log(`\n[${result.index}] ${result.title}`);
            if (result.description) {
              console.log(`    ${result.description.substring(0, 150)}...`);
            }
            if (result.link) {
              console.log(`    Link: ${result.link}`);
            }
          });
          
          // Add instructions for clicking results
          console.log('\nTo click on a result, use: "click on result 1" or "click on the 3rd result"');
        } else {
          console.log('No search results found on this page.');
        }
        break;
        
      case 'text':
        console.log('PAGE TEXT:');
        console.log(content.text.substring(0, 2000) + (content.text.length > 2000 ? '...' : ''));
        break;
        
      case 'main_content':
        console.log(`PAGE: ${content.title}\n`);
        
        if (content.headings && content.headings.length > 0) {
          console.log('Main Headings:');
          content.headings.forEach(h => {
            console.log(`${h.level === 1 ? '=== ' : '--- '}${h.text}${h.level === 1 ? ' ===' : ' ---'}`);
          });
          console.log();
        }
        
        if (content.content && content.content.length > 0) {
          console.log('Content Preview:');
          content.content.forEach(paragraph => {
            console.log(paragraph);
            console.log();
          });
        }
        break;
        
      case 'full':
      default:
        // Print page info
        console.log(`PAGE: ${content.pageInfo.title}`);
        console.log(`URL: ${content.pageInfo.url}`);
        
        if (content.pageInfo.metaDescription) {
          console.log(`Description: ${content.pageInfo.metaDescription}`);
        }
        console.log();
        
        // Print main headings
        if (content.headings && content.headings.length > 0) {
          const mainHeadings = content.headings.filter(h => h.level <= 2);
          if (mainHeadings.length > 0) {
            console.log('Main Headings:');
            mainHeadings.forEach(h => {
              console.log(`${h.level === 1 ? '# ' : '## '}${h.text}`);
            });
            console.log();
          }
        }
        
        // Print content preview
        if (content.paragraphs && content.paragraphs.length > 0) {
          console.log('Content Preview:');
          content.paragraphs.slice(0, 3).forEach(paragraph => {
            console.log(paragraph);
            console.log();
          });
          
          if (content.paragraphs.length > 3) {
            console.log(`... and ${content.paragraphs.length - 3} more paragraphs`);
          }
        }
        
        // If it's a search page, show search results
        if (content.isSearchPage && content.searchResults?.length > 0) {
          console.log('\nSearch Results:');
          content.searchResults.slice(0, 5).forEach(result => {
            console.log(`\n[${result.index}] ${result.title || 'Untitled'}`);
            if (result.description) {
              console.log(`    ${result.description.substring(0, 100)}...`);
            }
          });
          
          if (content.searchResults.length > 5) {
            console.log(`\n... and ${content.searchResults.length - 5} more results`);
          }
          
          // Add instructions for clicking results
          console.log('\nTo click on a result, try: "click result 1" or "click on the 2nd result"');
        }
        
        console.log('\nFor more details, try:');
        console.log('- "extract headings" - to see all headings');
        console.log('- "extract links" - to see all links');
        console.log('- "extract search results" - to see all search results');
        console.log('- "extract text" - to see all text content');
        break;
    }
    
    console.log('\n==== END OF EXTRACTION ====\n');
  }

  /**
   * Extract and display search results from the current page
   * @returns {Promise<Object>} - Search results data
   */
  async extractSearchResults() {
    console.log('Extracting search results from the current page...');
    
    // Use our extraction method with search-results content type
    const content = await this.browserController.extractPageContent('search-results');
    
    if (!content || content.error) {
      console.error('Error extracting search results:', content?.error || 'Unknown error');
      return { error: content?.error || 'Failed to extract search results', count: 0 };
    }
    
    // Check if we're on a search page with results
    if (!content.isSearchPage || !content.searchResults || content.searchResults.length === 0) {
      console.log('\n==== SEARCH RESULTS ====\n');
      console.log('No search results found on this page.');
      console.log('\nThis doesn\'t appear to be a search results page.');
      console.log('Try performing a search first with:');
      console.log('  > search for [term]');
      console.log('  > kaggle-search [term]');
      console.log('\n==== END OF EXTRACTION ====\n');
      
      return { count: 0, isSearchPage: content.isSearchPage };
    }
    
    // Format and display the search results
    console.log('\n==== SEARCH RESULTS ====\n');
    
    // Display current search query if available
    try {
      const searchQuery = await this.browserController.page.evaluate(() => {
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"], input[aria-label*="Search"]');
        return searchInput ? searchInput.value : null;
      });
      
      if (searchQuery) {
        console.log(`Search query: "${searchQuery}"\n`);
      }
    } catch (error) {
      // Ignore error if we can't extract the search query
    }
    
    // Display the results
    console.log(`Found ${content.searchResults.length} search results:\n`);
    
    // Take a screenshot of the search results for debugging
    await this.browserController.takeDebugScreenshot('search-results-page', 'test_images');
    
    content.searchResults.forEach(result => {
      // Create a visually distinctive display for each result
      console.log(`\n[${result.index}] ${result.title}`);
      console.log(`${'='.repeat(60)}`);
      
      if (result.description) {
        // Format description to be more readable
        const formattedDesc = result.description
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 200);
          
        console.log(`${formattedDesc}${formattedDesc.length >= 200 ? '...' : ''}`);
      }
      
      if (result.link) {
        console.log(`\nLink: ${result.link}`);
      }
      
      console.log(`${'='.repeat(60)}`); // Add separator between results
    });
    
    // Add clear instructions for clicking results
    console.log('\n\nTo view a search result, use one of these commands:');
    console.log('=================================================');
    console.log('1. click_result 1          <- Direct command to click first result');
    console.log('2. click_result 2          <- Direct command to click second result');
    console.log('3. click_result 3          <- Direct command to click third result');
    console.log('\nNOTE: The "click_result" command is the most reliable way to click results');
    console.log('      Avoid using "click on Nth result" as it may not work correctly.');
    console.log('\n==== END OF SEARCH RESULTS ====\n');
    
    return {
      count: content.searchResults.length,
      results: content.searchResults,
      isSearchPage: true
    };
  }

  /**
   * Direct method to search Kaggle by constructing the search URL
   * @param {string} searchTerm - The term to search for
   * @returns {Promise<boolean>} - Whether the navigation was successful
   */
  async directSearchKaggle(searchTerm) {
    if (!searchTerm) {
      console.error('No search term provided for direct search');
      return false;
    }
    
    try {
      // Format the search term for the URL
      const encodedTerm = encodeURIComponent(searchTerm.trim());
      
      // Construct the Kaggle search URL
      const searchUrl = `https://www.kaggle.com/search?q=${encodedTerm}`;
      
      console.log(`Navigating directly to search URL: ${searchUrl}`);
      
      // Navigate to the search URL
      await this.browserController.navigate(searchUrl);
      
      // Take a screenshot for verification - wrapped in try-catch
      try {
        if (typeof this.browserController.takeDebugScreenshot === 'function') {
          await this.browserController.takeDebugScreenshot('direct-search-result', 'test_images');
        } else {
          console.log('Screenshot feature not available, continuing without taking screenshot');
        }
      } catch (screenshotError) {
        console.log('Screenshot error (non-critical):', screenshotError.message);
      }
      
      console.log('✅ Direct search navigation completed');
      return true;
    } catch (error) {
      console.error('Error during direct search navigation:', error);
      return false;
    }
  }

  /**
   * Format and display search results in a clear, structured way
   * @returns {Promise<Object>} - The structured search results
   */
  async displayFormattedSearchResults() {
    console.log('Fetching and displaying formatted search results...');
    
    try {
      // Extract the results using our new function
      let results;
      try {
        if (typeof this.browserController.extractFormattedSearchResults === 'function') {
          results = await this.browserController.extractFormattedSearchResults();
        } else {
          console.log('extractFormattedSearchResults method not available');
          
          // Use a basic extraction fallback
          const basicResults = await this.basicSearchResultsExtraction();
          if (basicResults) {
            console.log('\n📋 SEARCH RESULTS (BASIC EXTRACTION)');
            console.log('=====================================');
            console.log(`Found approximately ${basicResults.count} results`);
            
            if (basicResults.results && basicResults.results.length > 0) {
              basicResults.results.forEach((result, i) => {
                console.log(`\n[${i+1}] ${result.title || 'Untitled Result'}`);
                if (result.description) {
                  console.log(`    ${result.description.substring(0, 150)}...`);
                }
              });
            }
            
            return basicResults;
          }
          
          return { 
            error: 'Structured search result extraction not available in this version',
            results: []
          };
        }
      } catch (extractError) {
        console.error('Error extracting search results:', extractError.message);
        return { error: `Failed to extract search results: ${extractError.message}` };
      }
      
      if (!results || results.error) {
        console.error(`Error extracting search results: ${results?.error || 'Unknown error'}`);
        return { error: results?.error || 'Failed to extract search results' };
      }
      
      // Print search info
      console.log('\n📋 SEARCH RESULTS');
      console.log('=================');
      console.log(`Search query: "${results.query}"`);
      console.log(`Total results: ${results.totalResults}`);
      console.log(`Showing ${results.results.length} results on this page`);
      console.log('=================\n');
      
      // Print each result in a formatted way
      results.results.forEach((result, index) => {
        console.log(`[${result.index}] ${result.title}`);
        console.log(`    Type: ${result.type}`);
        
        if (result.author) {
          console.log(`    Author: ${result.author}`);
        }
        
        if (result.metadata && result.metadata.time) {
          console.log(`    When: ${result.metadata.time}`);
        }
        
        // Print metadata if available
        if (result.metadata) {
          const metadataInfo = [];
          if (result.metadata.upvotes) metadataInfo.push(`${result.metadata.upvotes} upvotes`);
          if (result.metadata.comments) metadataInfo.push(`${result.metadata.comments} comments`);
          
          if (metadataInfo.length > 0) {
            console.log(`    Stats: ${metadataInfo.join(', ')}`);
          }
        }
        
        // Print a preview of the content
        if (result.content) {
          // Format content to be more readable
          const preview = result.content.length > 150 
            ? result.content.substring(0, 147) + '...' 
            : result.content;
          
          console.log(`    Preview: ${preview}`);
        }
        
        // Print URL if available
        if (result.urls && result.urls.length > 0) {
          console.log(`    URL: ${result.urls[0]}`);
        }
        
        console.log('----------------------------------------');
      });
      
      // Add instructions
      console.log('\nTo see details for a specific result, use:');
      console.log('  > "show result 3" - Display details for the 3rd result');
      console.log('  > "click_result 2" - Click on the 2nd result to open it');
      
      return results;
    } catch (error) {
      console.error('Error displaying formatted search results:', error);
      return { error: `Failed to display search results: ${error.message}` };
    }
  }
  
  /**
   * Basic fallback method to extract search results when the full method is unavailable
   * @returns {Promise<Object>} - Basic search results data
   */
  async basicSearchResultsExtraction() {
    try {
      return await this.browserController.page.evaluate(() => {
        // Find search results using basic selectors
        const resultItems = Array.from(document.querySelectorAll('div[role="listitem"], .mdc-card, .result-item, main div > div > div'));
        
        if (!resultItems || resultItems.length === 0) {
          return { count: 0, results: [] };
        }
        
        // Extract basic info from each result
        const results = resultItems.slice(0, 10).map((item, index) => {
          // Get title - look for headings or strong text
          const titleEl = item.querySelector('h1, h2, h3, h4, strong, b');
          const title = titleEl ? titleEl.textContent.trim() : `Result ${index+1}`;
          
          // Get any paragraph text as description
          const paragraphs = Array.from(item.querySelectorAll('p'));
          const description = paragraphs.length > 0 
            ? paragraphs.map(p => p.textContent.trim()).join(' ')
            : item.textContent.trim().substring(0, 200);
          
          return {
            title,
            description: description.length > 200 ? description.substring(0, 197) + '...' : description
          };
        });
        
        return {
          count: resultItems.length,
          results
        };
      });
    } catch (error) {
      console.error('Error in basic extraction:', error.message);
      return null;
    }
  }

  /**
   * Display details for a specific search result
   * @param {number} resultNumber - The 1-based index of the result to display
   * @returns {Promise<Object>} - The detailed result information
   */
  async displaySpecificResult(resultNumber) {
    console.log(`Fetching details for search result #${resultNumber}...`);
    
    // Extract all results first
    let results;
    try {
      if (typeof this.browserController.extractFormattedSearchResults === 'function') {
        results = await this.browserController.extractFormattedSearchResults();
      } else {
        console.log('extractFormattedSearchResults method not available');
        return { 
          error: 'Result extraction feature not available in this version. Try using "show-results" first.'
        };
      }
    } catch (extractError) {
      console.error('Error extracting search results:', extractError.message);
      return { error: 'Failed to extract search results: ' + extractError.message };
    }
    
    if (results.error) {
      console.error(`Error: ${results.error}`);
      return { error: results.error };
    }
    
    // Find the specific result
    if (resultNumber < 1 || resultNumber > results.results.length) {
      console.log(`Error: Result #${resultNumber} not found. Available results: 1-${results.results.length}`);
      return { error: 'Result number out of range' };
    }
    
    // Get the requested result
    const result = results.results[resultNumber - 1];
    
    // Display the details
    console.log('\n🔍 RESULT DETAILS');
    console.log('=================');
    console.log(`Result #${resultNumber} of ${results.results.length}`);
    console.log('=================\n');
    
    console.log(`Title: ${result.title}`);
    console.log(`Type: ${result.type}`);
    
    if (result.author) {
      console.log(`Author: ${result.author}`);
    }
    
    // Print metadata in a structured way
    console.log('\nMetadata:');
    if (result.metadata.time) console.log(`  • Published: ${result.metadata.time}`);
    if (result.metadata.upvotes) console.log(`  • Upvotes: ${result.metadata.upvotes}`);
    if (result.metadata.comments) console.log(`  • Comments: ${result.metadata.comments}`);
    
    // Print the full content
    if (result.content) {
      console.log('\nContent:');
      console.log('----------------------------------------');
      console.log(result.content);
      console.log('----------------------------------------');
    }
    
    // Print all URLs
    if (result.urls && result.urls.length > 0) {
      console.log('\nURLs:');
      result.urls.forEach((url, i) => {
        console.log(`  ${i+1}. ${url}`);
      });
    }
    
    // Add instructions
    console.log('\nActions:');
    console.log(`  • To open this result: "click_result ${resultNumber}"`);
    console.log('  • To go back to all results: "show search results"');
    
    return { result };
  }

  /**
   * Parse Kaggle search results using AI
   * @returns {Promise<Object>} - AI-interpreted search results
   */
  async parseKaggleSearchWithAI() {
    console.log('Using AI to parse Kaggle search results...');
    
    try {
      // First extract the HTML content of the search results page
      const html = await this.browserController.page.content();
      
      // Extract basic page info
      const pageInfo = await this.browserController.page.evaluate(() => {
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"], input[aria-label*="Search"]');
        const searchQuery = searchInput ? searchInput.value : '';
        
        // Try to get search query from URL if not found in input
        if (!searchQuery) {
          const urlParams = new URLSearchParams(window.location.search);
          const queryParam = urlParams.get('q') || urlParams.get('query') || urlParams.get('search');
          if (queryParam) return queryParam;
        }
        
        return {
          title: document.title,
          url: window.location.href,
          searchQuery: searchQuery || new URLSearchParams(window.location.search).get('q') || 'unknown'
        };
      });
      
      console.log(`Analyzing search results for query: "${pageInfo.searchQuery}"`);
      
      // Use OpenAI to parse the HTML and extract meaningful information
      const promptContent = `
This is the HTML content of a Kaggle search results page for the query "${pageInfo.searchQuery}".
URL: ${pageInfo.url}

Extract and format the search results in a structured way. For each result include:
1. Title
2. Type (Dataset, Notebook, Competition, etc.)
3. Author/Creator
4. Brief description
5. Any relevant stats (upvotes, downloads, etc.)

Format your response as structured JSON. Return a valid JSON object with an array of result objects.

If there are no search results, explain why and suggest possible reasons.

HTML content:
${html.substring(0, 15000)} 
      `;
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo", 
        messages: [
          {
            role: "system",
            content: "You are an HTML parser that extracts structured information from web pages and returns it in JSON format."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });
      
      if (response.choices && response.choices.length > 0) {
        const parsedContent = response.choices[0].message.content.trim();
        
        // Try to parse as JSON
        try {
          const jsonResponse = JSON.parse(parsedContent);
          console.log('\n==== AI PARSED SEARCH RESULTS (JSON) ====\n');
          console.log(JSON.stringify(jsonResponse, null, 2));
          console.log('\n==== END OF AI PARSED RESULTS ====\n');
          
          return { 
            content: jsonResponse,
            query: pageInfo.searchQuery,
            pageTitle: pageInfo.title,
            url: pageInfo.url,
            format: 'json'
          };
        } catch (jsonError) {
          // If not valid JSON, return as text
          console.log('\n==== AI PARSED SEARCH RESULTS (TEXT) ====\n');
          console.log(parsedContent);
          console.log('\n==== END OF AI PARSED RESULTS ====\n');
          
          return { 
            content: parsedContent,
            query: pageInfo.searchQuery,
            pageTitle: pageInfo.title,
            url: pageInfo.url,
            format: 'text'
          };
        }
      } else {
        console.log('No valid response from OpenAI');
        return { error: 'Failed to parse content with AI' };
      }
    } catch (error) {
      console.error('Error parsing content with AI:', error);
      
      // If OpenAI fails, fall back to our standard parser
      console.log('Falling back to standard result parsing...');
      return await this.displayFormattedSearchResults();
    }
  }

  /**
   * Parse raw page content using AI
   * @param {Object} content - The structured content
   * @returns {Promise<Object>} - AI-interpreted content
   */
  async parseContentWithAI(content) {
    if (!this.openai) {
      console.log('OpenAI client not available, cannot parse with AI');
      return content;
    }
    
    console.log('Using AI to parse and interpret page content...');
    
    try {
      // Prepare prompt based on content type
      let promptContent;
      
      switch (content.type) {
        case 'search_results':
          promptContent = `
Analyze these search results and provide a concise summary:
${JSON.stringify(content.searchResults, null, 2)}

Include:
1. Brief overview of what was found
2. Highlight the most relevant or popular results
3. Any patterns or trends in the results
`;
          break;
          
        case 'full':
        default:
          promptContent = `
Analyze this webpage content and provide a clear, concise summary:
Title: ${content.pageInfo?.title || 'Unknown'}
URL: ${content.pageInfo?.url || 'Unknown'}

Content includes:
${content.headings ? `- ${content.headings.length} headings` : ''}
${content.paragraphs ? `- ${content.paragraphs.length} paragraphs` : ''}
${content.lists ? `- ${content.lists.length} lists` : ''}
${content.tables ? `- ${content.tables.length} tables` : ''}
${content.images ? `- ${content.images.length} images` : ''}

Sample text content:
${content.paragraphs ? content.paragraphs.slice(0, 3).join('\n\n') : ''}
${content.rawText ? content.rawText.substring(0, 1000) + '...' : ''}

Provide a brief, informative summary of what this page contains and what it's about.
`;
          break;
      }
      
      const response = await this.openai.createCompletion({
        model: "text-davinci-003", // Use GPT-3.5 model
        prompt: promptContent,
        max_tokens: 1000,
        temperature: 0.3,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
      });
      
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const parsedContent = response.data.choices[0].text.trim();
        
        console.log('\n==== AI INTERPRETED CONTENT ====\n');
        console.log(parsedContent);
        console.log('\n==== END OF AI INTERPRETATION ====\n');
        
        return { 
          original: content,
          aiSummary: parsedContent
        };
      } else {
        console.log('No valid response from OpenAI');
        return content;
      }
    } catch (error) {
      console.error('Error interpreting content with AI:', error);
      return content;
    }
  }

  /**
   * Extract and parse information about a specific search result using AI
   * @param {number} resultNumber - The 1-based index of the result to analyze
   * @returns {Promise<Object>} - Detailed information about the result
   */
  async parseSpecificResultWithAI(resultNumber) {
    console.log(`Using AI to analyze search result #${resultNumber}...`);
    
    try {
      // First try to extract the search results
      let results;
      try {
        if (typeof this.browserController.extractFormattedSearchResults === 'function') {
          results = await this.browserController.extractFormattedSearchResults();
        } else {
          console.log('extractFormattedSearchResults method not available, falling back to direct HTML analysis');
          return await this.parseSpecificResultDirectly(resultNumber);
        }
      } catch (extractError) {
        console.log('Error extracting formatted results:', extractError.message);
        console.log('Falling back to direct HTML analysis...');
        return await this.parseSpecificResultDirectly(resultNumber);
      }
      
      if (results.error || !results.results || results.results.length === 0) {
        // If standard extraction fails, try a more direct approach
        return await this.parseSpecificResultDirectly(resultNumber);
      }
      
      // Check if the requested result exists
      if (resultNumber < 1 || resultNumber > results.results.length) {
        console.log(`Result #${resultNumber} not found. Available results: 1-${results.results.length}`);
        return { error: `Result #${resultNumber} not found.` };
      }
      
      // Get the specific result
      const result = results.results[resultNumber - 1];
      
      // Use OpenAI to analyze the result
      const promptContent = `
Analyze this Kaggle search result in detail and provide comprehensive information:

Result #${resultNumber}:
Title: ${result.title}
Type: ${result.type}
Author: ${result.author || 'Unknown'}
Content: ${result.content || 'No description available'}
URLs: ${result.urls ? result.urls.join(', ') : 'None'}
Metadata: ${JSON.stringify(result.metadata || {})}

Please provide:
1. A comprehensive description of what this item is
2. Why it might be useful or interesting
3. Any notable features or stats
4. For datasets: what kind of data it contains, size, format, etc.
5. For notebooks: what analysis or models it contains
6. For competitions: what the challenge is about

Format your response as a structured JSON object with the following fields:
- title: The title of the result
- type: Type of content (dataset, notebook, etc.)
- author: The creator/owner
- description: A detailed description
- features: Array of key features or highlights
- usefulness: Why this might be interesting or valuable
- stats: Any statistics or metrics mentioned
- additionalInfo: Any other relevant information

Your response should be valid JSON that can be parsed.
`;
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert data science assistant that analyzes search results from Kaggle and provides detailed insights in structured JSON format."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      });
      
      if (response.choices && response.choices.length > 0) {
        const analysisText = response.choices[0].message.content.trim();
        
        // Try to parse as JSON first
        try {
          const analysisJson = JSON.parse(analysisText);
          
          console.log('\n==== AI ANALYSIS OF SEARCH RESULT (JSON) ====\n');
          console.log(`Result #${resultNumber}: ${result.title}`);
          console.log('='.repeat(50));
          console.log(JSON.stringify(analysisJson, null, 2));
          console.log('\n==== END OF AI ANALYSIS ====\n');
          
          return { 
            resultNumber,
            result,
            aiAnalysis: analysisJson,
            format: 'json'
          };
        } catch (jsonError) {
          // If not valid JSON, return as text
          console.log('\n==== AI ANALYSIS OF SEARCH RESULT (TEXT) ====\n');
          console.log(`Result #${resultNumber}: ${result.title}`);
          console.log('='.repeat(50));
          console.log(analysisText);
          console.log('\n==== END OF AI ANALYSIS ====\n');
          
          return { 
            resultNumber,
            result,
            aiAnalysis: analysisText,
            format: 'text'
          };
        }
      } else {
        console.log('No valid response from OpenAI');
        return { 
          resultNumber,
          result,
          error: 'Failed to generate AI analysis'
        };
      }
    } catch (error) {
      console.error(`Error analyzing result #${resultNumber} with AI:`, error);
      return { error: `Failed to analyze result #${resultNumber}: ${error.message}` };
    }
  }
  
  /**
   * Parse a specific search result directly from the page HTML
   * @param {number} resultNumber - The 1-based index of the result to analyze
   * @returns {Promise<Object>} - Detailed information about the result
   */
  async parseSpecificResultDirectly(resultNumber) {
    console.log(`Attempting direct extraction and analysis of result #${resultNumber}...`);
    
    try {
      // Extract result HTML directly using JavaScript in the browser context
      const resultHTML = await this.browserController.page.evaluate((index) => {
        // Try multiple selectors that might contain search results
        const selectors = [
          '.mdc-card', '.mdc-list-item', 
          '[data-testid="search-results"] > div', 
          '[role="listitem"]',
          '.result-item', '.search-result',
          // Kaggle specific selectors
          '.sc-lgprfV', '.sc-dkrFOg',
          // Very generic selectors as fallback
          'main > div > div'
        ];
        
        for (const selector of selectors) {
          const items = document.querySelectorAll(selector);
          if (items && items.length > 0) {
            // Check if we have enough items
            if (index <= items.length) {
              // Get the specific result (adjust for 0-based index)
              const item = items[index - 1];
              return {
                html: item.outerHTML,
                itemCount: items.length,
                selector
              };
            }
          }
        }
        
        // If none of the selectors worked, capture the whole page for analysis
        return {
          html: document.body.innerHTML,
          itemCount: 0,
          selector: 'body',
          fullPage: true
        };
      }, resultNumber);
      
      if (!resultHTML || !resultHTML.html) {
        return { error: 'Could not extract HTML for the specified result' };
      }
      
      console.log(`Found ${resultHTML.itemCount} results using selector: ${resultHTML.selector}`);
      
      // Use OpenAI to parse the HTML and extract information
      const promptContent = `
${resultHTML.fullPage ? 
  `This is the full HTML of a Kaggle search results page. Please find and analyze result #${resultNumber}.` : 
  `This is the HTML of search result #${resultNumber} from a Kaggle search.`}

Please extract and analyze all available information about this result, including:
1. Title
2. Type (Dataset, Notebook, Competition, etc.)
3. Author/Owner
4. Description or summary
5. Key statistics (upvotes, downloads, etc.)
6. Any other relevant information

Format your response as a JSON object with fields for title, type, author, description, stats, and any other relevant information.
Ensure your response is valid JSON that can be parsed.

HTML content:
${resultHTML.html.substring(0, 10000)}
`;
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an HTML parser that extracts structured data from web content and returns it in JSON format."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      });
      
      if (response.choices && response.choices.length > 0) {
        const analysisText = response.choices[0].message.content.trim();
        
        // Try to parse as JSON first
        try {
          const analysisJson = JSON.parse(analysisText);
          
          console.log('\n==== AI ANALYSIS OF SEARCH RESULT (JSON) ====\n');
          console.log(`Direct HTML Analysis of Result #${resultNumber}`);
          console.log('='.repeat(50));
          console.log(JSON.stringify(analysisJson, null, 2));
          console.log('\n==== END OF AI ANALYSIS ====\n');
          
          return { 
            resultNumber,
            aiAnalysis: analysisJson,
            foundItems: resultHTML.itemCount,
            format: 'json'
          };
        } catch (jsonError) {
          // If not valid JSON, return as text
          console.log('\n==== AI ANALYSIS OF SEARCH RESULT (TEXT) ====\n');
          console.log(`Direct HTML Analysis of Result #${resultNumber}`);
          console.log('='.repeat(50));
          console.log(analysisText);
          console.log('\n==== END OF AI ANALYSIS ====\n');
          
          return { 
            resultNumber,
            aiAnalysis: analysisText,
            foundItems: resultHTML.itemCount,
            format: 'text'
          };
        }
      } else {
        return { error: 'Failed to generate AI analysis from HTML' };
      }
    } catch (error) {
      console.error(`Error in direct HTML analysis of result #${resultNumber}:`, error);
      return { error: `Direct analysis failed: ${error.message}` };
    }
  }

  /**
   * For backwards compatibility with existing code
   */
  async lastResortKaggleLogin() {
    console.log('lastResortKaggleLogin is now an alias for directFillBothFields');
    return await this.directFillBothFields();
  }

  /**
   * Complete L2 demonstration flow - login, search, and extract data
   * @param {string} searchQuery - The search query to use
   * @returns {Promise<Object>} - The extracted data
   */
  async demonstrateL2Flow(searchQuery = 'covid-19 dataset') {
    console.log('Demonstrating L2 flow: Login, Search, and Extract Data');
    
    try {
      // Step 1: Login to Kaggle
      console.log('\n===== STEP 1: LOGIN TO KAGGLE =====');
      await this.performKaggleLogin();
      
      // Take a screenshot after login
      await this.browserController.takeDebugScreenshot('after-login');
      
      // Step 2: Search for the query
      console.log('\n===== STEP 2: PERFORM SEARCH =====');
      await this.directSearchKaggle(searchQuery);
      
      // Wait for results to load
      await this.browserController.wait(3000);
      
      // Take a screenshot after search
      await this.browserController.takeDebugScreenshot('after-search');
      
      // Step 3: Extract and format search results
      console.log('\n===== STEP 3: EXTRACT AND FORMAT RESULTS =====');
      
      // Use AI if available, otherwise use standard extraction
      let results;
      if (this.openai) {
        console.log('Using AI to extract structured data...');
        results = await this.parseKaggleSearchWithAI();
      } else {
        console.log('Using standard extraction to get structured data...');
        results = await this.displayFormattedSearchResults();
      }
      
      // Step 4: Analyze a specific result
      console.log('\n===== STEP 4: ANALYZE SPECIFIC RESULT =====');
      const specificResultNumber = 1; // Analyze first result
      
      let specificResult;
      if (this.openai) {
        console.log(`Using AI to analyze result #${specificResultNumber}...`);
        specificResult = await this.parseSpecificResultWithAI(specificResultNumber);
      } else {
        console.log(`Extracting details for result #${specificResultNumber}...`);
        specificResult = await this.displaySpecificResult(specificResultNumber);
      }
      
      // Final step: Return structured result
      return {
        flow: 'L2 Demonstration',
        steps: [
          { step: 'Login', success: true },
          { step: 'Search', query: searchQuery, success: true },
          { step: 'Extract Results', success: !!results && !results.error, count: results?.results?.length || 0 },
          { step: 'Analyze Specific Result', resultNumber: specificResultNumber, success: !!specificResult && !specificResult.error }
        ],
        searchResults: results,
        specificResult: specificResult,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error during L2 flow demonstration:', error);
      return {
        flow: 'L2 Demonstration',
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      };
    }
  }

  async doSequenceLogin() {
    console.log('Performing reliable sequence login...');
    
    try {
      // Step 1: Check if we're on Kaggle and navigate if not
      const url = await this.browserController.page.url();
      if (!url.includes('kaggle.com')) {
        console.log('Navigating to Kaggle.com...');
        await this.browserController.navigate('https://www.kaggle.com/');
        await this.browserController.wait(1500);
      }
      
      // Step 2: Click Sign In button
      console.log('Finding and clicking the Sign In button...');
      await this.browserController.clickKaggleSignInLink();
      await this.browserController.wait(1500);
      
      // Step 3: Check if credentials are set, set them if not
      if (!this.config.kaggle.username || !this.config.kaggle.password) {
        console.log('No credentials found. Please set them first with set-credentials command.');
        return false;
      }
      
      // Step 4: Click Email sign-in option
      console.log('Clicking email sign-in option...');
      await this.browserController.clickKaggleEmailSignIn();
      await this.browserController.wait(1500);
      
      // Step 5: Fill in credentials (PASSWORD FIRST approach) with multiple attempts
      console.log('Filling credentials - using PASSWORD FIRST approach...');
      
      // Maximum retry attempts
      const MAX_FILL_ATTEMPTS = 3;
      let fillSuccess = false;
      
      for (let attempt = 1; attempt <= MAX_FILL_ATTEMPTS; attempt++) {
        console.log(`Attempt ${attempt}/${MAX_FILL_ATTEMPTS} to fill credentials...`);
        
        // Clear fields first to ensure a clean start for each attempt
        await this.browserController.page.evaluate(() => {
          const passwordField = document.querySelector('input[type="password"]');
          const emailField = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
          
          if (passwordField) {
            passwordField.value = '';
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          if (emailField) {
            emailField.value = '';
            emailField.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        
        await this.browserController.wait(300);
        
        // Try different approaches for filling the password first
        if (attempt === 1) {
          // First attempt: Use evaluate approach
          await this.browserController.page.evaluate((pass) => {
            const passwordField = document.querySelector('input[type="password"]');
            if (passwordField) {
              passwordField.focus();
              passwordField.value = pass;
              passwordField.dispatchEvent(new Event('input', { bubbles: true }));
              passwordField.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, this.config.kaggle.password);
        } else if (attempt === 2) {
          // Second attempt: Use type method with click first
          const passwordField = await this.browserController.page.$('input[type="password"]');
          if (passwordField) {
            await passwordField.click({ clickCount: 3 }); // Triple click to select all
            await passwordField.type(this.config.kaggle.password, { delay: 100 });
          }
        } else {
          // Third attempt: Use fill method
          try {
            await this.browserController.page.fill('input[type="password"]', this.config.kaggle.password);
          } catch (e) {
            console.log('Fill method failed, using direct DOM manipulation');
            await this.browserController.page.evaluate((pass) => {
              document.querySelector('input[type="password"]').value = pass;
              const event = new Event('input', { bubbles: true });
              document.querySelector('input[type="password"]').dispatchEvent(event);
            }, this.config.kaggle.password);
          }
        }
        
        await this.browserController.wait(300);
        
        // Now fill the username field
        if (attempt === 1) {
          // First attempt: Use evaluate approach
          await this.browserController.page.evaluate((user) => {
            const emailField = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
            if (emailField) {
              emailField.value = user;
              emailField.dispatchEvent(new Event('input', { bubbles: true }));
              emailField.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, this.config.kaggle.username);
        } else if (attempt === 2) {
          // Second attempt: Use type method with click first
          const emailField = await this.browserController.page.$('input[type="email"], input[name="email"], input[name="username"]');
          if (emailField) {
            await emailField.click({ clickCount: 3 }); // Triple click to select all
            await emailField.type(this.config.kaggle.username, { delay: 100 });
          }
        } else {
          // Third attempt: Use fill method
          try {
            await this.browserController.page.fill('input[type="email"], input[name="email"], input[name="username"]', this.config.kaggle.username);
          } catch (e) {
            console.log('Fill method failed, using direct DOM manipulation');
            await this.browserController.page.evaluate((user) => {
              const emailField = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
              if (emailField) {
                emailField.value = user;
                emailField.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }, this.config.kaggle.username);
          }
        }
        
        await this.browserController.wait(300);
        
        // Verify fields are filled correctly before submission
        const verification = await this.browserController.page.evaluate(() => {
          const emailField = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
          const passwordField = document.querySelector('input[type="password"]');
          
          return {
            emailFilled: emailField && emailField.value && emailField.value.length > 0,
            passwordFilled: passwordField && passwordField.value && passwordField.value.length > 0,
            emailValue: emailField ? emailField.value : 'not found',
            passwordLength: passwordField && passwordField.value ? passwordField.value.length : 0
          };
        });
        
        console.log('Field verification result:');
        console.log(`Username field: ${verification.emailFilled ? 'FILLED' : 'EMPTY'} (${verification.emailValue})`);
        console.log(`Password field: ${verification.passwordFilled ? 'FILLED' : 'EMPTY'} (length: ${verification.passwordLength})`);
        
        if (verification.emailFilled && verification.passwordFilled) {
          fillSuccess = true;
          break;
        } else {
          console.log(`Attempt ${attempt} failed, ${verification.emailFilled ? '' : 'username field empty, '}${verification.passwordFilled ? '' : 'password field empty.'}`);
          await this.browserController.wait(500); // Wait before next attempt
        }
      }
      
      if (!fillSuccess) {
        console.log('Failed to fill both fields after multiple attempts. Trying direct DOM injection...');
        
        // Last resort: Try direct JavaScript injection to set values
        const directInjection = await this.browserController.page.evaluate((credentials) => {
          try {
            // Find form elements
            const passwordField = document.querySelector('input[type="password"]');
            const emailField = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
            
            if (!passwordField || !emailField) {
              return { success: false, reason: 'Could not find input fields' };
            }
            
            // Set values directly in DOM
            passwordField.value = credentials.password;
            emailField.value = credentials.username;
            
            // Force React to recognize the changes with events
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            passwordField.dispatchEvent(new Event('change', { bubbles: true }));
            emailField.dispatchEvent(new Event('input', { bubbles: true }));
            emailField.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Verify the values were set
            return {
              success: true,
              passwordSet: passwordField.value === credentials.password,
              emailSet: emailField.value === credentials.username
            };
          } catch (error) {
            return { success: false, reason: error.toString() };
          }
        }, {
          username: this.config.kaggle.username,
          password: this.config.kaggle.password
        });
        
        if (!directInjection.success) {
          console.log(`Direct DOM injection failed: ${directInjection.reason}`);
          console.log('Login will likely fail. Consider trying again.');
        } else {
          console.log('Direct DOM injection results:');
          console.log(`- Password field set: ${directInjection.passwordSet}`);
          console.log(`- Email field set: ${directInjection.emailSet}`);
          
          if (!directInjection.passwordSet || !directInjection.emailSet) {
            console.log('Direct injection partially failed. Login may not succeed.');
          }
        }
      }
      
      // Step 6: Submit the form by pressing Enter
      console.log('Submitting the form by pressing Enter key...');
      await this.browserController.page.keyboard.press('Enter');
      
      // Wait for navigation
      console.log('Waiting for navigation after form submission...');
      await this.browserController.wait(5000);
      
      // Step 7: Double-check login status with multiple methods
      let isLoggedIn = false;
      
      // Method 1: Check URL and presence of user elements
      const loginStatus = await this.checkLoginStatus();
      
      if (loginStatus.isLoggedIn) {
        console.log('✅ Login successful according to UI check!');
        isLoggedIn = true;
      } else {
        console.log('❌ Login check #1 failed. Trying additional verification...');
        
        // Method 2: Check for login-specific elements
        const loginCheck2 = await this.browserController.page.evaluate(() => {
          // Look for elements that would only be present when logged in
          const userMenuExists = !!document.querySelector('[data-testid="UserMenuButton"]');
          const avatarExists = !!document.querySelector('img.avatar');
          const usernameDisplayed = !!document.querySelector('.username');
          const loginFormExists = !!document.querySelector('form[action*="login"]');
          
          return {
            userMenuExists,
            avatarExists,
            usernameDisplayed,
            loginFormExists,
            url: window.location.href
          };
        });
        
        console.log('Secondary login verification:');
        console.log(`- User menu exists: ${loginCheck2.userMenuExists}`);
        console.log(`- Avatar exists: ${loginCheck2.avatarExists}`);
        console.log(`- Username displayed: ${loginCheck2.usernameDisplayed}`);
        console.log(`- Login form still exists: ${loginCheck2.loginFormExists}`);
        console.log(`- Current URL: ${loginCheck2.url}`);
        
        if (loginCheck2.userMenuExists || loginCheck2.avatarExists || loginCheck2.usernameDisplayed) {
          console.log('✅ Login successful according to secondary UI check!');
          isLoggedIn = true;
        } else if (loginCheck2.loginFormExists) {
          console.log('❌ Login failed - still on login form.');
          
          // Method 3: One last attempt - try clicking the submit button
          console.log('Making one final attempt by clicking submit button...');
          const submitClicked = await this.browserController.page.evaluate(() => {
            const submitButton = document.querySelector('button[type="submit"]');
            if (submitButton) {
              submitButton.click();
              return true;
            }
            return false;
          });
          
          if (submitClicked) {
            console.log('Clicked submit button, waiting for navigation...');
            await this.browserController.wait(5000);
            
            // Check if this worked
            const finalCheck = await this.checkLoginStatus();
            if (finalCheck.isLoggedIn) {
              console.log('✅ Login finally successful after clicking submit button!');
              isLoggedIn = true;
            }
          }
        }
      }
      
      if (isLoggedIn) {
        console.log('Login process completed successfully!');
        return true;
      } else {
        console.log('All login attempts failed. Please try again or check credentials.');
        return false;
      }
    } catch (error) {
      console.error('Error during sequence login:', error.message);
      return false;
    }
  }

  /**
   * Check if the user is currently logged in to Kaggle
   * @returns {Promise<Object>} Login status information
   */
  async checkLoginStatus() {
    try {
      // Get current URL
      const currentUrl = await this.browserController.page.url();
      
      // Evaluate page to check for signs of being logged in
      const loginIndicators = await this.browserController.page.evaluate(() => {
        return {
          // Check URL
          url: window.location.href,
          
          // Various UI indicators that suggest successful login
          hasAvatar: !!document.querySelector('img.avatar, [data-testid="avatar"]'),
          hasUserMenu: !!document.querySelector('[data-testid="UserMenuButton"], .userMenu'),
          hasUsername: !!document.querySelector('.username, .display-name'),
          
          // Indicators that we're still on login page
          hasLoginForm: !!document.querySelector('form[action*="login"]'),
          hasSignInText: document.body.innerText.toLowerCase().includes('sign in'),
          hasLoginButton: !!document.querySelector('button[type="submit"]'),
          
          // General page content
          pageTitle: document.title,
          bodyText: document.body.innerText.substring(0, 200)
        };
      });
      
      // Debug information
      console.log('Login status check:');
      console.log(`Current URL: ${currentUrl}`);
      console.log(`Has avatar: ${loginIndicators.hasAvatar}`);
      console.log(`Has user menu: ${loginIndicators.hasUserMenu}`);
      
      // Determine login status
      const isLoggedIn = (
        // Positive indicators
        (loginIndicators.hasAvatar || loginIndicators.hasUserMenu || loginIndicators.hasUsername) &&
        // Negative indicators
        !(loginIndicators.hasLoginForm && loginIndicators.hasSignInText && loginIndicators.hasLoginButton)
      );
      
      return {
        isLoggedIn,
        currentUrl,
        indicators: loginIndicators
      };
    } catch (error) {
      console.error('Error checking login status:', error.message);
      return { isLoggedIn: false, error: error.message };
    }
  }
}

module.exports = InteractAPI; 