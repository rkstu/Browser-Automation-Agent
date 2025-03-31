#!/usr/bin/env node

const readline = require('readline');
const InteractAPI = require('./InteractAPI');
const config = require('./config/config');
const { OpenAI } = require('openai');

// Set up readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> ',
});

// Add support for password input (no echo)
rl.stdoutMuted = false;
rl._writeToOutput = function _writeToOutput(stringToWrite) {
  if (rl.stdoutMuted && stringToWrite.trim() !== rl.prompt.trim())
    rl.output.write('*');
  else
    rl.output.write(stringToWrite);
};

// Create instance of InteractAPI
let interactAPI = null;

// Command history
const history = [];

// Keep track of available commands for NLP matching
const availableCommands = {};

// Add OpenAI client initialization
let openai = null;

try {
  openai = new OpenAI({
    apiKey: config.openai.apiKey,
  });
  console.log('CLI: OpenAI client initialized successfully');
} catch (error) {
  console.warn('CLI: Failed to initialize OpenAI: ' + error.message);
}

// Add the command mapping function
async function mapToExactCommand(userInput) {
  if (!openai) {
    console.log('OpenAI client not available, using original command');
    return userInput;
  }
  
  // Handle specific mappings without calling OpenAI to save time and be more reliable
  const directMappings = {
    'sign in with email': 'sequence-login',
    'login with email': 'sequence-login',
    'email login': 'click-email-option',
    'use email to sign in': 'sequence-login',
    'click sign in': 'click-signin',
    'click sign in button': 'click-signin',
    'click on sign in': 'click-signin',
    'click on the sign in button': 'click-signin',
    'click login': 'click-signin',
    'sign in': 'click-signin',
    'login': 'click-signin',
    'press enter': 'press-enter',
    'hit enter': 'press-enter',
    'fill username': 'fill-username',
    'fill password': 'fill-password',
    'enter username': 'fill-username',
    'enter password': 'fill-password',
    'log me in': 'sequence-login',
    'complete sign in': 'sequence-login'
  };
  
  // Check for search commands
  const normalizedInput = userInput.toLowerCase().trim();
  
  // Handle search commands specifically - with typo correction
  const searchVariants = ['search for ', 'saerch for ', 'serch for ', 'seach for ', 'searh for '];
  const hasSearchPrefix = searchVariants.some(prefix => normalizedInput.startsWith(prefix));
  const hasKaggleSearch = normalizedInput.includes('search kaggle for ') || 
                          normalizedInput.includes('saerch kaggle for ') ||
                          normalizedInput.includes('serch kaggle for ');
  
  if (hasSearchPrefix || 
      hasKaggleSearch || 
      normalizedInput.includes('find datasets') || 
      normalizedInput.includes('look for')) {
    
    // Extract the search term
    let searchTerm = '';
    
    // Handle various search prefixes (including misspellings)
    for (const prefix of searchVariants) {
      if (normalizedInput.startsWith(prefix)) {
        searchTerm = normalizedInput.substring(prefix.length).trim();
        break;
      }
    }
    
    // Handle Kaggle search variations
    if (searchTerm === '' && hasKaggleSearch) {
      // Match after "search kaggle for " or any common typo variant
      const match = normalizedInput.match(/(?:s[ae](?:r|er)ch\s+kaggle\s+for\s+)(.+)/i);
      if (match && match[1]) {
        searchTerm = match[1].trim();
      }
    }
    
    // Additional extraction methods from original code
    if (searchTerm === '' && normalizedInput.includes('find datasets')) {
      searchTerm = normalizedInput.replace('find datasets', '').replace('for', '').replace('about', '').trim();
    } else if (searchTerm === '' && normalizedInput.includes('look for')) {
      searchTerm = normalizedInput.replace('look for', '').replace('on kaggle', '').trim();
    }
    
    // If we found a search term, handle it
    if (searchTerm !== '') {
      // If search term includes "diabetes" or related terms, map to the specific command
      if (searchTerm.includes('diabetes') || searchTerm.includes('blood sugar') || searchTerm.includes('glucose')) {
        console.log(`\n✅ Mapped search to command: "search for diabetes dataset"\n`);
        return 'search for diabetes dataset';
      } 
      
      console.log(`\n✅ Corrected search command: "search for ${searchTerm}"\n`);
      return `search for ${searchTerm}`;
    }
  }
  
  // Check for direct mapping
  if (directMappings[normalizedInput]) {
    const mappedCommand = directMappings[normalizedInput];
    console.log(`\n✅ Mapped to command: "${mappedCommand}"\n`);
    return mappedCommand;
  }
  
  // Continue with OpenAI mapping for other commands
  try {
    // Define the available commands
    const availableCommands = [
      // Basic commands
      "init", "close", "help", "quit", "exit", "history", "clear",
      
      // Navigation commands
      "go to kaggle.com",
      
      // Authentication commands
      "click sign in", 
      "click-signin",
      "click-email-option", 
      "sign in with email",
      "fill-username", 
      "fill-password", 
      "press-enter",
      "fill-credentials", 
      "direct-login",
      "kaggle-login",
      
      // Search commands
      "search for diabetes dataset",
      "show-results",
      "show result 1", "show result 2", "show result 3", 
      "click_result 1", "click_result 2", "click_result 3"
    ];
    
    const prompt = `Map this user input to one of the available commands:
User input: "${userInput}"

Available commands:
${availableCommands.join('\n')}

Return ONLY the exact command that best matches the user's intent, nothing else. 
If the user is trying to "click sign in" or "click on sign in button", return "click sign in".
If the user wants to "sign in with email", return "click-email-option".
For numerical commands, match the appropriate number (e.g., "show the third result" → "show result 3").
If you can't find a good match, return the original input.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You map user inputs to exact commands. Return ONLY the matching command." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 30
    });
    
    const mappedCommand = response.choices[0].message.content.trim();
    
    // Only use the mapped command if it's in our list or very close
    if (availableCommands.includes(mappedCommand) || 
        mappedCommand.startsWith("show result ") || 
        mappedCommand.startsWith("click_result ")) {
      if (mappedCommand !== userInput) {
        console.log(`\n✅ Mapped to command: "${mappedCommand}"\n`);
      }
      return mappedCommand;
    }
    
    return userInput;
  } catch (error) {
    console.warn('Error mapping command with OpenAI:', error.message);
    return userInput; // Return original input if there's an error
  }
}

// Help text
function showHelp() {
  console.log('\nAvailable commands:');
  console.log('==================');
  console.log('init                    - Initialize the browser (must be run first)');
  console.log('quit/exit               - Exit the application');
  console.log('help                    - Show this help message');
  console.log('go to [url]             - Navigate to a specific URL');
  console.log('click [text]            - Click on an element with text');
  console.log('search for [query]      - Search for a query');
  console.log('take-screenshot         - Take a screenshot and save it to the screenshots folder');
  console.log('scroll [direction]      - Scroll the page (up, down, left, right)');
  console.log('back                    - Go back to previous page');
  console.log('forward                 - Go forward to next page');
  console.log('refresh                 - Refresh the current page');
  console.log('type [text]             - Type text in the focused input field');
  console.log('press-enter             - Press the Enter key');
  console.log('set-credentials         - Set Kaggle username and password');
  console.log('click-signin            - Click the Sign In button on Kaggle');
  console.log('click-email-option      - Click the "Sign in with Email" option');
  console.log('fill-username           - Fill the username field (requires credentials)');
  console.log('fill-password           - Fill the password field (requires credentials)');
  console.log('sequence-login          - MOST RELIABLE: Multi-attempt login with verification (recommended)');
  console.log('demonstrate-l2          - Run complete L2 demonstration flow (login, search, extract data)');
  console.log('==================');
  console.log('\nYou can also enter natural language commands like:');
  console.log('"go to kaggle.com" or "search for data science competition"');
  console.log('"sign in with email" - uses the enhanced multi-attempt login process');
  console.log('"show result 2" - display detailed information about the second search result');
  
  console.log('\n📝 LOGIN TIP: For the most reliable login experience, use "sign in with email" or "sequence-login"');
  console.log('This uses our enhanced multi-attempt login system with verification and recovery mechanisms.');
}

/**
 * Initialize the browser
 */
async function initializeBrowser() {
  try {
    if (interactAPI) {
      console.log('Browser is already initialized. Closing current browser...');
      await interactAPI.close();
    }
    
    interactAPI = new InteractAPI();
    console.log('Initializing browser...');
    await interactAPI.initialize();
    
    if (!interactAPI.isInitialized) {
      console.error('Browser initialization failed. Please try again or restart the application.');
      return false;
    }
    
    console.log('Browser initialized successfully.');
    return true;
  } catch (error) {
    console.error('Failed to initialize browser:', error.message);
    interactAPI = null; // Reset the API instance on failure
    return false;
  }
}

/**
 * Process a user command
 */
async function processCommand(command) {
  // Add command to history
  history.push(command);
  
  // Handle direct search commands with common typos
  const normalizedCommand = command.toLowerCase().trim();
  const searchPrefixes = ['search for ', 'saerch for ', 'serch for ', 'seach for ', 'searh for '];
  
  for (const prefix of searchPrefixes) {
    if (normalizedCommand.startsWith(prefix)) {
      const searchTerm = command.substring(prefix.length).trim();
      if (searchTerm) {
        console.log(`Detected search command: "${searchTerm}"`);
        await kaggleSearch(searchTerm);
        return;
      }
    }
  }
  
  // Handle "kaggle search for" format
  const kaggleSearchMatch = normalizedCommand.match(/(?:s[ae](?:r|er)ch\s+kaggle\s+for\s+)(.+)/i);
  if (kaggleSearchMatch && kaggleSearchMatch[1]) {
    const searchTerm = kaggleSearchMatch[1].trim();
    console.log(`Detected Kaggle search command: "${searchTerm}"`);
    await kaggleSearch(searchTerm);
    return;
  }
  
  // Process built-in commands
  switch (command.toLowerCase()) {
    case 'help':
      showHelp();
      return;
      
    case 'exit':
    case 'quit':
      if (interactAPI) {
        await interactAPI.close();
      }
      rl.close();
      process.exit(0);
      return;
      
    case 'history':
      console.log('\nCommand History:');
      history.forEach((cmd, index) => {
        console.log(`${index + 1}. ${cmd}`);
      });
      return;
      
    case 'clear':
      console.clear();
      return;
      
    case 'init':
      await initializeBrowser();
      return;
      
    case 'close':
      if (interactAPI) {
        await interactAPI.close();
        console.log('Browser closed.');
        interactAPI = null;
      } else {
        console.log('Browser is not initialized.');
      }
      return;
      
    case 'check-credentials':
      checkCredentials();
      return;
      
    case 'set-credentials':
      await setCredentials();
      return;
      
    case 'kaggle-login':
      await performKaggleLogin();
      return;
      
    case 'show-search-results':
    case 'show-results':
    case 'list-results':
    case 'display-results':
    case 'print-results':
    case 'view-results':
      if (!interactAPI || !interactAPI.isInitialized) {
        console.log('Browser is not initialized. Run "init" first.');
        return;
      }
      await interactAPI.displayFormattedSearchResults();
      return;
      
    case 'help-ai':
    case 'ai-help':
      console.log('\nAI-powered Content Analysis Commands:');
      console.log('  analyze page                 - Use AI to analyze the current page');
      console.log('  tell me about this page      - AI-powered page content summary');
      console.log('  explain search results       - AI analysis of search results');
      console.log('  tell me about result <num>   - AI analysis of specific search result');
      console.log('  summarize result <num>       - Summarize a specific search result');
      console.log('  explain result <num>         - Detailed explanation of a specific result');
      console.log('\nThese commands use OpenAI to provide more detailed and user-friendly analysis of page content.');
      return;
    case 'simplified-login':
      await simplifiedLogin();
      break;
    case 'verified-login':
      await verifiedLogin();
      break;
    case 'sequence-login':
      await sequenceLogin();
      break;
    case 'demonstrate-l2':
    case 'l2-demo':
    case 'run-l2-flow':
      // Extract a custom search query if provided
      const demoQuery = command.split(' ').slice(1).join(' ').trim();
      await demonstrateL2Flow(demoQuery || 'covid-19 dataset');
      return;
  }
  
  // Handle kaggle-search command with multi-word support
  if (command.toLowerCase().startsWith('kaggle-search')) {
    const searchTerm = command.substring('kaggle-search'.length).trim();
    await kaggleSearch(searchTerm);
    return;
  }
  
  // New step-by-step login commands
  switch (command.toLowerCase()) {
    case 'click-signin':
      await clickSignInButton();
      return;
      
    case 'click-email-option':
      await clickEmailOption();
      return;
      
    case 'fill-username':
      await fillUsername();
      return;
      
    case 'fill-password':
      await fillPassword();
      return;
      
    case 'press-enter':
      await pressEnterToSubmit();
      return;
      
    case 'fill-credentials':
      await fillCredentials();
      return;
      
    case 'direct-login':
      await directLogin();
      return;
      
    case 'help-search-results':
      console.log('\nSearch Results Commands:');
      console.log('  show-results            - Display all search results in a formatted way');
      console.log('  show result <number>    - Show detailed information about a specific result');
      console.log('  click_result <number>   - Click on a specific search result by number');
      console.log('  print page content      - Display formatted results on search pages');
      console.log('  search for <term>       - Perform a search using direct URL navigation');
      console.log('  kaggle-search <term>    - Alias for search for <term>');
      console.log('\nExample usage:');
      console.log('  search for covid-19 dataset');
      console.log('  show-results');
      console.log('  show result 3           # Display detailed info about the third result');
      console.log('  click_result 2          # Click on the second result to open it');
      return;
  }
  
  // Special handling for AI-powered analysis commands
  if (/^(analyze|tell\s+me\s+about|explain|describe|summarize)\s+(this\s+)?page(\s+content)?$/i.test(command)) {
    console.log('Detected AI page analysis command...');
    
    if (!interactAPI || !interactAPI.isInitialized) {
      console.log('Browser is not initialized. Run "init" first.');
      return;
    }
    
    // Extract and analyze with AI
    await interactAPI.extract('page content', true);
    return;
  }
  
  // AI analysis of search results
  if (/^(analyze|tell\s+me\s+about|explain|describe|summarize)\s+(the\s+)?(search\s+)?results$/i.test(command)) {
    console.log('Detected AI search results analysis command...');
    
    if (!interactAPI || !interactAPI.isInitialized) {
      console.log('Browser is not initialized. Run "init" first.');
      return;
    }
    
    // Check if we're on a search page
    const currentUrl = await interactAPI.browserController.page.url();
    if (currentUrl.includes('/search')) {
      console.log('Analyzing search results with AI...');
      await interactAPI.parseKaggleSearchWithAI();
    } else {
      console.log('Not on a search page. Please navigate to a search page first.');
    }
    return;
  }
  
  // AI analysis of specific search result
  if (/^(analyze|tell\s+me\s+about|explain|describe|summarize)\s+(the\s+)?(search\s+)?result\s+(\d+)$/i.test(command)) {
    console.log('Detected AI specific result analysis command...');
    
    if (!interactAPI || !interactAPI.isInitialized) {
      console.log('Browser is not initialized. Run "init" first.');
      return;
    }
    
    // Extract the result number
    const match = command.match(/(\d+)/);
    if (match && match[1]) {
      const resultNumber = parseInt(match[1], 10);
      console.log(`Analyzing search result #${resultNumber} with AI...`);
      await interactAPI.parseSpecificResultWithAI(resultNumber);
    } else {
      console.log('Could not determine which result to analyze. Please specify a number.');
    }
    return;
  }
  
  // After the special handling section, modify the print/display page content handler to use AI when needed
  // Special handling for print page content to use our new formatted display
  if (/^(print|display|show|view|extract)\s+(content|page content|page|content of( the)? page)$/i.test(command)) {
    console.log('Detected print page content command, using formatted display...');
    
    if (!interactAPI || !interactAPI.isInitialized) {
      console.log('Browser is not initialized. Run "init" first.');
      return;
    }
    
    // Check if we're on a search page
    const currentUrl = await interactAPI.browserController.page.url();
    if (currentUrl.includes('/search')) {
      console.log('Detected search page, showing formatted results...');
      // Use AI if available, otherwise use standard extraction
      if (interactAPI.openai) {
        await interactAPI.parseKaggleSearchWithAI();
      } else {
        await interactAPI.displayFormattedSearchResults();
      }
    } else {
      // Use the regular extract method for non-search pages
      console.log('Not a search page, using standard content extraction...');
      await interactAPI.extract('page content');
    }
    return;
  }
  
  // Special handling for showing specific search result with AI analysis
  if (/^(show|display|view|print)\s+(result|search result|contents of(?: the)? (?:result|search result))\s+(\d+).*$/i.test(command) ||
      /^(show|display|view|print)\s+(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|sixth|seventh|eighth|ninth|tenth)\s+(?:result|search result).*$/i.test(command) ||
      /^(?:what|tell me|show me|check)(?: is|'s)?(?: the)?(?: contents of)?(?: the)? (first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|sixth|seventh|eighth|ninth|tenth|\d+)(?:st|nd|rd|th)?(?: search)? result.*$/i.test(command)) {
    console.log('Detected show specific result command...');
    
    // Extract the result number
    let resultNumber;
    
    // Check for ordinal words
    const ordinalMatch = command.match(/(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|sixth|seventh|eighth|ninth|tenth)/i);
    if (ordinalMatch) {
      const ordinalMap = {
        'first': 1, '1st': 1,
        'second': 2, '2nd': 2, 
        'third': 3, '3rd': 3,
        'fourth': 4, '4th': 4,
        'fifth': 5, '5th': 5,
        'sixth': 6, '6th': 6,
        'seventh': 7, '7th': 7,
        'eighth': 8, '8th': 8,
        'ninth': 9, '9th': 9,
        'tenth': 10, '10th': 10
      };
      resultNumber = ordinalMap[ordinalMatch[1].toLowerCase()];
    } else {
      // Extract numeric results
      const numMatch = command.match(/\d+/);
      if (numMatch) {
        resultNumber = parseInt(numMatch[0], 10);
      } else {
        resultNumber = 1; // Default to first result
      }
    }
    
    console.log(`Displaying result #${resultNumber}`);
    
    // Execute the display specific result method
    if (!interactAPI || !interactAPI.isInitialized) {
      console.log('Browser is not initialized. Run "init" first.');
      return;
    }
    
    // Use AI analysis if available
    if (interactAPI.openai) {
      await interactAPI.parseSpecificResultWithAI(resultNumber);
    } else {
      await interactAPI.displaySpecificResult(resultNumber);
    }
    return;
  }
  
  // Execute browser command
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  try {
    // Special handling for click_result command
    if (/^click(?:_|\s+)result\s+\d+$/i.test(command)) {
      console.log('Detected click_result command...');
      // Extract the result number
      const resultNumber = parseInt(command.match(/\d+/)[0], 10);
      console.log(`Executing click_result ${resultNumber}`);
      
      // Execute the click_result action directly
      const result = await interactAPI.clickSearchResult(resultNumber);
      
      if (result) {
        console.log('Successfully clicked on search result');
      } else {
        console.log('Failed to click on search result');
      }
      return;
    }
    
    console.log('Executing command...');
    const result = await interactAPI.executeCommand(command);
    
    // Handle predefined commands matched by OpenAI
    if (result.action === 'execute_predefined') {
      console.log(`\n✅ AI matched your natural language command to: "${result.target}"`);
      console.log(`Executing this command now...\n`);
      // Execute the matched predefined command
      return await processCommand(result.target);
    }
    
    if (result && result.error === true) {
      console.error(`Error: ${result.message}`);
      if (result.suggestion) {
        console.log(`Suggestion: ${result.suggestion}`);
      }
    } else {
      console.log('Command executed successfully.');
      if (typeof result === 'string') {
        console.log(`Result: ${result}`);
      } else if (result && typeof result === 'object') {
        console.log('Result:', JSON.stringify(result, null, 2));
      }
    }
  } catch (error) {
    console.error('Error executing command:', error.message);
  }
}

/**
 * Check if credentials exist in the .env file
 */
function checkCredentials() {
  const config = require('./config/config');
  
  if (config.kaggle.username && config.kaggle.password) {
    console.log('✅ Kaggle credentials found in .env file.');
    console.log(`Username: ${config.kaggle.username.slice(0, 2)}${'*'.repeat(config.kaggle.username.length - 4)}${config.kaggle.username.slice(-2)}`);
    console.log(`Password: ${'*'.repeat(8)}`);
  } else {
    console.log('❌ Kaggle credentials not found in .env file.');
    console.log('To add them, update your .env file with:');
    console.log('KAGGLE_USERNAME=your_username');
    console.log('KAGGLE_PASSWORD=your_password');
    console.log('Or use the "set-credentials" command for this session.');
  }
}

/**
 * Set credentials for the current session
 */
async function setCredentials() {
  // Check if browser is initialized
  if (!interactAPI) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  // Get username
  console.log('Enter your Kaggle username/email:');
  const username = await new Promise(resolve => rl.question('> ', resolve));
  
  // Get password (no echo)
  console.log('Enter your Kaggle password:');
  rl.stdoutMuted = true;
  const password = await new Promise(resolve => rl.question('> ', resolve));
  rl.stdoutMuted = false;
  console.log('');  // Add newline
  
  // Update config
  interactAPI.config.kaggle.username = username;
  interactAPI.config.kaggle.password = password;
  
  console.log('Credentials set for this session.');
}

/**
 * Perform a complete Kaggle login process
 */
async function performKaggleLogin() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  // Check for credentials
  if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
    console.log('Credentials not found. Please set them first with "set-credentials".');
    await setCredentials();
  }
  
  try {
    // Step 1: Navigate to Kaggle
    console.log('Step 1/3: Navigating to Kaggle.com...');
    await interactAPI.executeAction({
      action: 'navigate',
      target: 'https://kaggle.com',
      value: null
    });
    
    // Step 2: Click sign in
    console.log('Step 2/3: Clicking Sign In button...');
    await interactAPI.executeAction({
      action: 'click',
      target: 'sign in',
      value: null
    });
    
    // Wait for auth options
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Click email option and log in
    console.log('Step 3/3: Signing in with email and filling credentials...');
    await interactAPI.executeCommand('use credentials from .env file');
    
    console.log('Login process completed.');
  } catch (error) {
    console.error('Error during Kaggle login:', error.message);
  }
}

/**
 * Click the "Sign In" button
 */
async function clickSignInButton() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  console.log('Clicking the Sign In button...');
  
  // Check if we need to navigate to Kaggle first
  const url = await interactAPI.browserController.page.evaluate(() => window.location.href);
  if (!url.includes('kaggle.com')) {
    console.log('Not on Kaggle.com - navigating there first');
    await interactAPI.executeCommand('go to kaggle.com');
    await interactAPI.browserController.wait(3000);
  }
  
  try {
    // Debug whether the method exists
    console.log('Checking if specialized method exists:', 
                typeof interactAPI.browserController.findAndClickSignInLink === 'function');
    
    // Use alternative approach first - direct page content evaluation
    console.log('Trying with direct page evaluation first...');
    
    // Take a screenshot if the method exists
    try {
      if (typeof interactAPI.browserController.screenshot === 'function') {
        await interactAPI.browserController.screenshot('test_images/before-signin-click.png');
        console.log('Saved screenshot before attempting to click');
      }
    } catch (screenshotError) {
      console.log('Could not take screenshot:', screenshotError.message);
    }
    
    // Try direct click with JavaScript
    const result = await interactAPI.browserController.page.evaluate(() => {
      try {
        // Log current page structure
        console.log('Current URL:', window.location.href);
        console.log('Page title:', document.title);
        
        // Try to find the sign in button with various approaches
        
        // 1. Using text content
        const allLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        const signInLinks = allLinks.filter(el => {
          const text = (el.textContent || '').toLowerCase().trim();
          return text === 'sign in' || text === 'signin' || text === 'login' || text === 'log in';
        });
        
        console.log(`Found ${signInLinks.length} elements matching 'sign in' text`);
        
        if (signInLinks.length > 0) {
          console.log('Clicking first matching sign in element');
          signInLinks[0].click();
          return { clicked: true, method: 'text-match' };
        }
        
        // 2. Try data-testid or specific class search
        const possibleButtons = [
          document.querySelector('[data-testid="login-button"]'),
          document.querySelector('[data-testid="signin-button"]'),
          document.querySelector('[data-testid="account-button"]'),
          document.querySelector('.login-button'),
          document.querySelector('.sign-in'),
          document.querySelector('.signin'),
          document.querySelector('button.sc-FyfaH'),
          document.querySelector('[role="button"][aria-label*="sign in" i]')
        ].filter(Boolean);
        
        console.log(`Found ${possibleButtons.length} elements matching button selectors`);
        
        if (possibleButtons.length > 0) {
          console.log('Clicking first matching button element');
          possibleButtons[0].click();
          return { clicked: true, method: 'selector-match' };
        }
        
        // 3. Try standard header elements
        const headerElements = Array.from(document.querySelectorAll('header a, nav a, .navbar a'));
        console.log(`Found ${headerElements.length} header/nav elements`);
        
        // Find the one most likely to be sign in
        const headerSignIn = headerElements.find(el => {
          const text = (el.textContent || '').toLowerCase();
          return text.includes('sign') || text.includes('login') || text.includes('account');
        });
        
        if (headerSignIn) {
          console.log('Clicking header element that looks like sign in');
          headerSignIn.click();
          return { clicked: true, method: 'header-match' };
        }
        
        return { clicked: false, elements: {
          links: allLinks.length,
          buttons: possibleButtons.length,
          header: headerElements.length
        }};
      } catch (error) {
        return { clicked: false, error: error.toString() };
      }
    });
    
    if (result.clicked) {
      console.log(`✓ Successfully clicked sign in button using ${result.method}`);
      await interactAPI.browserController.wait(3000);
      
      // Take another screenshot if possible
      try {
        if (typeof interactAPI.browserController.screenshot === 'function') {
          await interactAPI.browserController.screenshot('test_images/after-signin-click.png');
        }
      } catch (screenshotError) {
        console.log('Could not take screenshot:', screenshotError.message);
      }
      
      console.log('Next step: Use "click-email-option" to click the Sign in with Email option');
      return true;
    } else {
      console.log('Direct evaluation failed to find sign in button:', result);
    }
    
    // Now try the specialized method if it exists
    if (typeof interactAPI.browserController.findAndClickSignInLink === 'function') {
      console.log('Using specialized findAndClickSignInLink method...');
      const result = await interactAPI.browserController.findAndClickSignInLink();
      
      if (result) {
        console.log('✓ Sign In button clicked successfully using specialized method');
        console.log('Next step: Use "click-email-option" to click the Sign in with Email option');
        return true;
      } else {
        console.log('× Specialized method failed to click Sign In button, falling back to regular click');
      }
    }
    
    // Fall back to regular click action
    console.log('Trying standard click action as last resort...');
    await interactAPI.executeAction({
      action: 'click',
      target: 'sign in',
      value: null
    });
    
    console.log('✓ Sign In button clicked with standard click action');
    console.log('Next step: Use "click-email-option" to click the Sign in with Email option');
    return true;
  } catch (error) {
    console.error('Error clicking Sign In button:', error.message);
    return false;
  }
}

/**
 * Click the Sign in with Email option
 */
async function clickEmailOption() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  console.log('Clicking the "Sign in with Email" option...');
  
  // Take a screenshot before starting if possible
  try {
    if (typeof interactAPI.browserController.screenshot === 'function') {
      await interactAPI.browserController.screenshot('test_images/before-email-option.png');
    }
  } catch (screenshotError) {
    console.log('Could not take screenshot:', screenshotError.message);
  }
  
  try {
    // First try direct JavaScript approach for more reliable clicking
    console.log('Trying direct JavaScript approach first...');
    
    const result = await interactAPI.browserController.page.evaluate(() => {
      try {
        // Get page info for debugging
        console.log('Current URL:', window.location.href);
        console.log('Page title:', document.title);
        
        // Try to find the email sign-in option with multiple approaches
        const emailSignInSelectors = [
          // By text content
          'button:has-text("Email")',
          'button:has-text("Sign in with Email")',
          'a:has-text("Email")',
          'a:has-text("Sign in with Email")',
          // By attribute
          '[data-testid="email-login-button"]',
          '[data-component-name="EmailSignInButton"]',
          // By class
          '.sc-jqCOkK',
          '.email-signin-button',
        ];
        
        // Look for any element containing the text "email" and "sign in"
        const allElements = document.querySelectorAll('button, a, div[role="button"]');
        console.log(`Found ${allElements.length} potential clickable elements`);
        
        // First try exact match for "Sign in with Email"
        const emailButtons = Array.from(allElements).filter(el => {
          const text = (el.textContent || '').toLowerCase();
          return text.includes('sign in with email') || text.includes('email sign in');
        });
        
        if (emailButtons.length > 0) {
          console.log(`Found ${emailButtons.length} "Sign in with Email" buttons`);
          emailButtons[0].click();
          return { clicked: true, method: 'exact-text-match' };
        }
        
        // Then try approximate match with both "email" and ("sign" or "log")
        const approxButtons = Array.from(allElements).filter(el => {
          const text = (el.textContent || '').toLowerCase();
          return text.includes('email') && (text.includes('sign') || text.includes('log'));
        });
        
        if (approxButtons.length > 0) {
          console.log(`Found ${approxButtons.length} buttons containing "email" and "sign/log"`);
          approxButtons[0].click();
          return { clicked: true, method: 'approx-text-match' };
        }
        
        // Then try just "email"
        const justEmailButtons = Array.from(allElements).filter(el => {
          const text = (el.textContent || '').toLowerCase();
          return text.includes('email');
        });
        
        if (justEmailButtons.length > 0) {
          console.log(`Found ${justEmailButtons.length} buttons containing "email"`);
          justEmailButtons[0].click();
          return { clicked: true, method: 'email-text-only' };
        }
        
        // Try specific selectors
        for (const selector of emailSignInSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            console.log(`Found element with selector: ${selector}`);
            element.click();
            return { clicked: true, method: `selector-${selector}` };
          }
        }
        
        // Last resort: find all buttons and click the second one (often the email option)
        const allButtons = document.querySelectorAll('button');
        if (allButtons.length >= 2) {
          console.log('Clicking the second button as a fallback');
          allButtons[1].click();
          return { clicked: true, method: 'second-button-fallback' };
        }
        
        // Return all buttons for debugging
        const buttonInfo = Array.from(allButtons).map(btn => ({
          text: btn.textContent?.trim(),
          classes: btn.className,
          id: btn.id
        }));
        
        return { 
          clicked: false, 
          elements: {
            buttons: allButtons.length,
            allElements: allElements.length
          },
          buttonInfo: buttonInfo
        };
      } catch (error) {
        return { clicked: false, error: error.toString() };
      }
    });
    
    if (result.clicked) {
      console.log(`✓ Successfully clicked email sign-in option with ${result.method}`);
      await interactAPI.browserController.wait(3000);
      
      // Take a screenshot after clicking if possible
      try {
        if (typeof interactAPI.browserController.screenshot === 'function') {
          await interactAPI.browserController.screenshot('test_images/after-email-option-click.png');
        }
      } catch (screenshotError) {
        console.log('Could not take screenshot:', screenshotError.message);
      }
      
      console.log('Next step: Use "fill-password" to enter password first, then "fill-username"');
      return true;
    } else {
      console.log('Direct JavaScript approach failed:', result);
    }
    
    // Use the specialized method if available
    if (typeof interactAPI.browserController.clickKaggleEmailSignIn === 'function') {
      console.log('Using specialized clickKaggleEmailSignIn method...');
      const result = await interactAPI.browserController.clickKaggleEmailSignIn();
      if (result) {
        console.log('✓ Successfully clicked email sign-in option with specialized method');
        console.log('Next step: Use "fill-password" to enter password first, then "fill-username"');
        return true;
      } else {
        console.log('× Specialized method failed to click email option');
      }
    } else {
      console.log('Specialized method not available');
    }
    
    // Fallback to execution through the API as last resort
    console.log('Using regular click method as last resort...');
    const clickResult = await interactAPI.executeAction({
      action: 'click',
      target: 'sign in with email',
      value: null
    });
    
    console.log('Click result:', clickResult);
    console.log('Next step: Use "fill-password" to enter password first, then "fill-username"');
    return true;
  } catch (error) {
    console.error('Error clicking Email option:', error.message);
    return false;
  }
}

/**
 * Fill the username field
 */
async function fillUsername() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  // First check credentials
  if (!interactAPI.config.kaggle.username) {
    console.log('No username set. Use "set-credentials" command first.');
    await setCredentials();
    return;
  }
  
  console.log('Filling username field...');
  
  // Use direct JavaScript injection for most reliable filling
  try {
    const success = await interactAPI.browserController.page.evaluate((username) => {
      try {
        // Find the username field
        const emailInput = document.querySelector('input[type="email"], input[type="text"]');
        if (!emailInput) return false;
        
        // Focus the field
        emailInput.focus();
        
        // Clear the field
        emailInput.value = '';
        
        // Set the value directly
        emailInput.value = username;
        
        // Dispatch events to trigger React state updates
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Store username in window object for persistence
        window._storedUsername = username;
        
        // Return focus to the field to prepare for tab to password
        emailInput.focus();
        
        // Verify value was set
        return emailInput.value === username;
      } catch(e) {
        console.error('Error in fillUsername:', e);
        return false;
      }
    }, interactAPI.config.kaggle.username);
    
    if (success) {
      console.log('✓ Username filled successfully using direct JavaScript');
      console.log('Next step: Use "fill-password" to enter password, then "press-enter" to submit');
      
      // Take a screenshot to verify the username was entered
      await interactAPI.browserController.takeDebugScreenshot('after-username-fill', 'test_images');
      return true;
    }
  } catch (error) {
    console.error('Direct JavaScript username filling failed:', error.message);
  }
  
  // Fallback to direct-login approach
  console.log('Reverting to direct-login approach which is more reliable...');
  try {
    const result = await interactAPI.fillKaggleCredentials();
    if (result) {
      console.log('✓ Direct login completed successfully');
      return true;
    }
  } catch (directError) {
    console.error('Direct login approach failed:', directError.message);
  }
  
  console.error('All username filling methods failed');
  return false;
}

/**
 * Fill the password field
 */
async function fillPassword() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  // First check credentials
  if (!interactAPI.config.kaggle.password) {
    console.log('No password set. Use "set-credentials" command first.');
    await setCredentials();
    return;
  }
  
  console.log('Filling password field without disturbing username...');
  
  // Use direct JavaScript injection with username preservation
  try {
    const success = await interactAPI.browserController.page.evaluate((password) => {
      try {
        // Store the current username value first
        const emailInput = document.querySelector('input[type="email"], input[type="text"]');
        const currentUsername = emailInput ? emailInput.value : '';
        
        // Find the password field
        const passwordInput = document.querySelector('input[type="password"]');
        if (!passwordInput) return { success: false, error: 'Password field not found' };
        
        // Focus the field
        passwordInput.focus();
        
        // Clear the field
        passwordInput.value = '';
        
        // Set the value directly
        passwordInput.value = password;
        
        // Dispatch events to trigger React state updates
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Return without touching the focus to avoid React state issues
        const passwordSuccess = passwordInput.value === password;
        
        // If username was lost, restore it
        if (emailInput && currentUsername && emailInput.value !== currentUsername) {
          console.log('Username was cleared, restoring it...');
          // Restore the username value without focusing
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          descriptor.set.call(emailInput, currentUsername);
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Verify both fields
        return { 
          success: passwordSuccess, 
          usernamePreserved: emailInput ? emailInput.value === currentUsername : true,
          passwordSet: passwordInput.value === password
        };
      } catch(e) {
        console.error('Error in fillPassword:', e);
        return { success: false, error: e.toString() };
      }
    }, interactAPI.config.kaggle.password);
    
    if (success.success) {
      console.log('✓ Password filled successfully using direct JavaScript');
      console.log(`✓ Username field ${success.usernamePreserved ? 'was preserved' : 'could not be preserved'}`);
      console.log('Next step: Use "press-enter" to submit the form');
      return true;
    } else {
      console.error('Failed to fill password:', success.error);
    }
  } catch (error) {
    console.error('Direct JavaScript password filling failed:', error.message);
  }
  
  // Fallback to special sequence-preserving approach
  try {
    console.log('Trying special sequence-preserving approach...');
    
    // Use the lastResortKaggleLogin method which is designed to work with this form
    const result = await interactAPI.lastResortKaggleLogin();
    if (result) {
      console.log('✓ Special sequence-preserving login succeeded!');
      return true;
    }
  } catch (specialError) {
    console.error('Special sequence-preserving approach failed:', specialError.message);
  }
  
  console.error('All password filling methods failed');
  return false;
}

/**
 * Fill both username and password fields
 */
async function fillCredentials() {
  const usernameSuccess = await fillUsername();
  
  // Add a significant delay between filling username and password
  // This gives React time to update its state
  await interactAPI.browserController.wait(2000);
  
  // Verify username field still has content before proceeding
  const usernameStillValid = await interactAPI.browserController.page.evaluate(() => {
    const emailInput = document.querySelector('input[type="email"], input[type="text"]');
    return emailInput && emailInput.value && emailInput.value.length > 0;
  });
  
  if (!usernameStillValid) {
    console.log('⚠️ Username was lost after delay, refilling...');
    await fillUsername();
    await interactAPI.browserController.wait(1000);
  }
  
  const passwordSuccess = await fillPassword();
  
  if (usernameSuccess && passwordSuccess) {
    console.log('✓ Both fields filled successfully');
    console.log('Next step: Use "press-enter" to submit the form');
    return true;
  } else {
    console.error('❌ Failed to fill one or both credentials fields');
    return false;
  }
}

/**
 * Press Enter to submit the form
 */
async function pressEnterToSubmit() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  console.log('Preparing to submit login form...');
  
  // First verify the form has values before submitting
  const formReady = await interactAPI.browserController.page.evaluate(() => {
    const emailInput = document.querySelector('input[type="email"], input[type="text"]');
    const passwordInput = document.querySelector('input[type="password"]');
    
    return {
      hasEmail: emailInput && emailInput.value && emailInput.value.length > 0,
      hasPassword: passwordInput && passwordInput.value && passwordInput.value.length > 0,
      emailValue: emailInput ? emailInput.value.slice(0, 2) + '...' : 'not found',
      passwordValue: passwordInput ? '******' : 'not found'
    };
  });
  
  console.log(`Form status before submission:
- Email field: ${formReady.hasEmail ? 'filled (' + formReady.emailValue + '...)' : 'EMPTY'}
- Password field: ${formReady.hasPassword ? 'filled' : 'EMPTY'}`);
  
  if (!formReady.hasEmail || !formReady.hasPassword) {
    console.log('⚠️ Form is not ready for submission! Make sure fields are filled first.');
    console.log('Refilling credentials before submission...');
    await fillCredentials();
    await interactAPI.browserController.wait(1000);
  }
  
  // Try multiple submission methods
  
  // Method 1: Direct form submission via JavaScript
  try {
    console.log('Trying direct form submission...');
    const submitted = await interactAPI.browserController.page.evaluate(() => {
      try {
        // Find the form and submit it
        const form = document.querySelector('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true }));
          return true;
        }
        
        // If no form, find submit button
        const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          submitBtn.click();
          return true;
        }
        
        return false;
      } catch (e) {
        console.error('Form submission error:', e);
        return false;
      }
    });
    
    if (submitted) {
      console.log('✓ Form submitted via JavaScript');
      await interactAPI.browserController.wait(2000);
      
      // Take a screenshot to verify
      const screenshotPath = `login-submission-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      await interactAPI.browserController.screenshot(screenshotPath);
      console.log(`Screenshot saved to ${screenshotPath}`);
      return true;
    }
  } catch (jsError) {
    console.error('JavaScript form submission failed:', jsError.message);
  }
  
  // Method 2: Focus password field and press Enter
  try {
    console.log('Focusing password field and pressing Enter...');
    
    // First focus the password field
    await interactAPI.browserController.page.click('input[type="password"]');
    await interactAPI.browserController.wait(500);
    
    // Press Enter to submit
    await interactAPI.browserController.pressEnter();
    console.log('✓ Enter key pressed on password field');
    
    await interactAPI.browserController.wait(2000);
    
    // Take a screenshot to verify
    const screenshotPath = `login-submission-enter-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    await interactAPI.browserController.screenshot(screenshotPath);
    console.log(`Screenshot saved to ${screenshotPath}`);
    return true;
  } catch (enterError) {
    console.error('Password + Enter submission failed:', enterError.message);
  }
  
  // Method 3: Find and click submit button directly
  try {
    console.log('Trying to find and click submit button...');
    
    // Try standard submit button selectors
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Log In")',
      'button.login-button',
      'button.submit',
      'button[data-testid="sign-in-button"]'
    ];
    
    for (const selector of submitSelectors) {
      try {
        const hasButton = await interactAPI.browserController.page.$(selector);
        if (hasButton) {
          console.log(`Found submit button with selector: ${selector}`);
          await interactAPI.browserController.page.click(selector);
          console.log('✓ Clicked submit button');
          await interactAPI.browserController.wait(2000);
          return true;
        }
      } catch (selectorError) {
        // Continue to next selector
      }
    }
    
    console.error('❌ Could not find any submit button to click');
  } catch (buttonError) {
    console.error('Submit button click failed:', buttonError.message);
  }
  
  console.error('❌ All form submission methods failed');
  return false;
}

/**
 * Use direct method to fill credentials and login
 */
async function directLogin() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  // Check credentials
  if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
    console.log('No credentials set. Please set them first.');
    await setCredentials();
  }
  
  console.log('Using most reliable PASSWORD-FIRST method for Kaggle login...');
  console.log('This method is designed to handle Kaggle\'s React form state management');
  
  try {
    // Try to take a screenshot before login attempt
    try {
      if (typeof interactAPI.browserController.takeDebugScreenshot === 'function') {
        await interactAPI.browserController.takeDebugScreenshot('before-direct-login', 'test_images');
      }
    } catch (error) {
      console.log('Screenshot not available, continuing without it');
    }
    
    // Use our more reliable method that fills both fields correctly
    const result = await interactAPI.directFillBothFields();
    
    if (result) {
      console.log('✓ Direct login successful');
      
      // Try to take a screenshot after login
      try {
        if (typeof interactAPI.browserController.takeDebugScreenshot === 'function') {
          await interactAPI.browserController.takeDebugScreenshot('after-direct-login', 'test_images');
        }
      } catch (error) {
        // Non-critical error
      }
      
      // Check if we are truly logged in
      try {
        const loginCheck = await interactAPI.browserController.page.evaluate(() => {
          return {
            url: window.location.href,
            hasAvatar: !!document.querySelector('img.avatar'),
            hasUserMenuButton: !!document.querySelector('[data-testid="UserMenuButton"]')
          };
        });
        
        console.log(`Current page: ${loginCheck.url}`);
        console.log(`Avatar detected: ${loginCheck.hasAvatar}`);
        console.log(`User menu detected: ${loginCheck.hasUserMenuButton}`);
      } catch (error) {
        // Non-critical error, we still succeeded with the login process
        console.log('Could not check login status, but form was submitted');
      }
      
      return true;
    } else {
      console.error('❌ Direct login failed');
      
      // Fallback to simpler approach if the sophisticated one failed
      console.log('Trying one last direct fill method...');
      try {
        // Fill password first, always
        await interactAPI.browserController.page.fill('input[type="password"]', interactAPI.config.kaggle.password);
        console.log('Filled password field directly');
        
        // Then username
        await interactAPI.browserController.page.fill('input[type="email"], input[type="text"]', interactAPI.config.kaggle.username);
        console.log('Filled username field directly');
        
        // And press Enter
        await interactAPI.browserController.pressEnter();
        console.log('Pressed Enter to submit');
        
        return true;
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError.message);
        return false;
      }
    }
  } catch (error) {
    console.error('Error during direct login:', error.message);
    return false;
  }
}

/**
 * Search Kaggle for a specific term
 */
async function kaggleSearch(term) {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  if (!term) {
    console.log('Please provide a search term. Example: kaggle-search "covid-19 dataset"');
    return;
  }
  
  console.log(`Searching Kaggle for: "${term}" using direct URL navigation`);
  
  try {
    // Use the direct URL navigation method instead of UI interaction
    const result = await interactAPI.directSearchKaggle(term);
    
    if (result) {
      console.log('Search completed successfully!');
    } else {
      console.error('Search failed to execute properly.');
    }
  } catch (error) {
    console.error('Error during search:', error.message);
  }
}

/**
 * Complete Kaggle login process in one command
 */
async function kaggleSignIn() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  try {
    // Step 1: Navigate to Kaggle if not already there
    const currentUrl = await interactAPI.browserController.page.url();
    if (!currentUrl.includes('kaggle.com')) {
      console.log('Step 1/4: Navigating to Kaggle.com...');
      await interactAPI.browserController.navigate('https://kaggle.com');
      await interactAPI.browserController.wait(2000);
    } else {
      console.log('Already on Kaggle.com, continuing...');
    }
    
    // Step 2: Check if we need to click Sign In button
    const needsSignIn = await interactAPI.browserController.page.evaluate(() => {
      const signInLinks = Array.from(document.querySelectorAll('a'))
        .filter(a => a.innerText && a.innerText.toLowerCase().includes('sign in'));
      return signInLinks.length > 0;
    });
    
    if (needsSignIn) {
      console.log('Step 2/4: Clicking Sign In button...');
      await interactAPI.browserController.page.evaluate(() => {
        const signInLinks = Array.from(document.querySelectorAll('a'))
          .filter(a => a.innerText && a.innerText.toLowerCase().includes('sign in'));
        if (signInLinks.length > 0) signInLinks[0].click();
      });
      await interactAPI.browserController.wait(2000);
    } else {
      console.log('Already on sign-in page, continuing...');
    }
    
    // Step 3: Check if we need to click "Sign in with Email" option
    const needsEmailOption = await interactAPI.browserController.page.evaluate(() => {
      return document.body.innerText.toLowerCase().includes('sign in with email');
    });
    
    if (needsEmailOption) {
      console.log('Step 3/4: Clicking "Sign in with Email" option...');
      await interactAPI.browserController.page.evaluate(() => {
        const emailButtons = Array.from(document.querySelectorAll('button'))
          .filter(b => b.innerText && b.innerText.toLowerCase().includes('email'));
        
        if (emailButtons.length > 0) {
          emailButtons[0].click();
          return true;
        }
        
        const emailLinks = Array.from(document.querySelectorAll('a'))
          .filter(a => a.innerText && a.innerText.toLowerCase().includes('email'));
        
        if (emailLinks.length > 0) {
          emailLinks[0].click();
          return true;
        }
        
        return false;
      });
      await interactAPI.browserController.wait(2000);
    }
    
    // Step 4: Fill fields and submit form in PASSWORD FIRST sequence
    console.log('Step 4/4: Filling credentials with PASSWORD FIRST approach...');
    
    // Check and set credentials if needed
    if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
      console.log('No credentials set. Setting them now...');
      await setCredentials();
    }
    
    // 1. First fill PASSWORD using direct manipulation
    console.log('Step 4.1: Filling PASSWORD first (critical for React forms)');
    const passwordFilled = await interactAPI.browserController.page.evaluate((password) => {
      try {
        // Find password field
        const passwordField = document.querySelector('input[type="password"]');
        if (!passwordField) return { success: false, error: 'Password field not found' };
        
        // Focus and fill
        passwordField.focus();
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
        
        return { success: true, passwordSet: passwordField.value === password };
      } catch (error) {
        return { success: false, error: error.toString() };
      }
    }, interactAPI.config.kaggle.password);
    
    if (!passwordFilled.success) {
      console.error('Failed to fill password:', passwordFilled.error);
      return false;
    }
    
    console.log('Password field filled successfully');
    await interactAPI.browserController.wait(500); // Wait for React to process
    
    // 2. Then fill USERNAME
    console.log('Step 4.2: Now filling USERNAME after password');
    const usernameFilled = await interactAPI.browserController.page.evaluate((username) => {
      try {
        // Find username field
        const emailField = document.querySelector('input[type="email"], input[type="text"]');
        if (!emailField) return { success: false, error: 'Username field not found' };
        
        // Fill without focusing first (important for React forms)
        emailField.value = username;
        emailField.dispatchEvent(new Event('input', { bubbles: true }));
        emailField.dispatchEvent(new Event('change', { bubbles: true }));
        
        return { success: true, usernameSet: emailField.value === username };
      } catch (error) {
        return { success: false, error: error.toString() };
      }
    }, interactAPI.config.kaggle.username);
    
    if (!usernameFilled.success) {
      console.error('Failed to fill username:', usernameFilled.error);
      return false;
    }
    
    console.log('Username field filled successfully');
    
    // 3. Verify both fields are filled correctly
    const fieldsVerified = await interactAPI.browserController.page.evaluate(() => {
      const emailField = document.querySelector('input[type="email"], input[type="text"]');
      const passwordField = document.querySelector('input[type="password"]');
      
      return {
        usernameField: emailField ? emailField.value : 'not found',
        passwordField: passwordField ? (passwordField.value ? 'filled' : 'empty') : 'not found'
      };
    });
    
    console.log('Field verification:');
    console.log(`- Username field: ${fieldsVerified.usernameField}`);
    console.log(`- Password field: ${fieldsVerified.passwordField}`);
    
    // 4. Submit form
    console.log('Step 4.3: Submitting form with Enter key');
    await interactAPI.browserController.page.keyboard.press('Enter');
    
    // Wait for navigation
    console.log('Waiting for navigation after form submission...');
    await interactAPI.browserController.wait(5000);
    
    // Verify login success
    const loginCheck = await interactAPI.browserController.page.evaluate(() => {
      return {
        url: window.location.href,
        hasAvatar: !!document.querySelector('img.avatar'),
        hasUserMenu: !!document.querySelector('[data-testid="UserMenuButton"]'),
        isLoggedIn: !window.location.href.includes('login')
      };
    });
    
    if (loginCheck.isLoggedIn || loginCheck.hasAvatar || loginCheck.hasUserMenu) {
      console.log('✅ Login successful!');
      console.log(`Current page: ${loginCheck.url}`);
      return true;
    } else {
      console.error('❌ Login failed - still on login page');
      
      // Last resort - try clicking submit button
      console.log('Trying to click submit button as last resort...');
      const submitClicked = await interactAPI.browserController.page.evaluate(() => {
        const submitButton = document.querySelector('button[type="submit"]');
        if (submitButton) {
          submitButton.click();
          return true;
        }
        return false;
      });
      
      if (submitClicked) {
        console.log('Submit button clicked, waiting for navigation...');
        await interactAPI.browserController.wait(5000);
      }
      
      return false;
    }
  } catch (error) {
    console.error('Error during Kaggle sign-in:', error.message);
    return false;
  }
}

/**
 * Combined function to click email option and fill credentials
 */
async function emailOptionAndFillCredentials() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  try {
    // First click the email option
    console.log('Step 1/3: Clicking "Sign in with Email" option...');
    const emailResult = await interactAPI.browserController.page.evaluate(() => {
      try {
        const emailElements = Array.from(document.querySelectorAll('button'))
          .filter(b => b.innerText && b.innerText.toLowerCase().includes('email'));
        
        if (emailElements.length > 0) {
          emailElements[0].click();
          return { success: true };
        }
        
        const emailLinks = Array.from(document.querySelectorAll('a'))
          .filter(a => a.innerText && a.innerText.toLowerCase().includes('email'));
        
        if (emailLinks.length > 0) {
          emailLinks[0].click();
          return { success: true };
        }
        
        return { success: false };
      } catch (error) {
        return { success: false, error: error.toString() };
      }
    });
    
    if (!emailResult.success) {
      console.warn('Could not find email option button');
    }
    
    // Wait for form to appear
    await interactAPI.browserController.wait(2000);
    
    // Check and set credentials if needed
    if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
      console.log('No credentials set. Setting them now...');
      await setCredentials();
    }
    
    // CRITICAL: Fill password FIRST, then fill username, and submit IMMEDIATELY
    console.log('Direct form submission using playwright APIs...');
    
    try {
      // Fill password field using the Playwright API
      await interactAPI.browserController.page.fill('input[type="password"]', interactAPI.config.kaggle.password);
      console.log('Password field filled');
      
      // Fill username field using the Playwright API
      await interactAPI.browserController.page.fill('input[type="email"], input[type="text"]', interactAPI.config.kaggle.username);
      console.log('Username field filled');
      
      // IMMEDIATELY press Enter without any checks or delays
      console.log('Pressing Enter immediately...');
      await interactAPI.browserController.page.keyboard.press('Enter');
      
      console.log('Login form submitted');
      
      // Wait for navigation
      console.log('Waiting for navigation...');
      await interactAPI.browserController.wait(5000);
      
      return true;
    } catch (error) {
      console.error('Error during form submission:', error.message);
      
      // Last resort approach - try the submit button
      console.log('Trying submit button as last resort...');
      try {
        const buttonClicked = await interactAPI.browserController.page.evaluate(() => {
          const submitButton = document.querySelector('button[type="submit"]');
          if (submitButton) {
            submitButton.click();
            return true;
          }
          return false;
        });
        
        if (buttonClicked) {
          console.log('Submit button clicked');
          await interactAPI.browserController.wait(5000);
        }
      } catch (buttonError) {
        console.error('Submit button approach failed:', buttonError.message);
      }
    }
  } catch (error) {
    console.error('Error during email option and credential filling:', error.message);
  }
}

/**
 * Simple one-step login with no verification or extra steps
 */
async function simplifiedLogin() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }

  // Check credentials
  if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
    console.log('No credentials set. Please set them first.');
    await setCredentials();
  }

  try {
    // Step 1: Check if we need to navigate to Kaggle
    const currentUrl = await interactAPI.browserController.page.url();
    if (!currentUrl.includes('kaggle.com')) {
      console.log('Navigating to Kaggle...');
      await interactAPI.browserController.navigate('https://kaggle.com');
      await interactAPI.browserController.wait(2000);
    }

    // Step 2: Check if we need to click Sign In
    const needsSignIn = await interactAPI.browserController.page.evaluate(() => {
      // Use standard DOM methods instead of Playwright selectors
      const signInLinks = Array.from(document.querySelectorAll('a')).filter(a => 
        (a.href && a.href.includes('login')) || 
        (a.textContent && a.textContent.toLowerCase().includes('sign in'))
      );
      return signInLinks.length > 0;
    });

    if (needsSignIn) {
      console.log('Clicking Sign In...');
      // Use standard DOM methods in evaluate instead of Playwright selectors
      await interactAPI.browserController.page.evaluate(() => {
        const signInLinks = Array.from(document.querySelectorAll('a')).filter(a => 
          (a.href && a.href.includes('login')) || 
          (a.textContent && a.textContent.toLowerCase().includes('sign in'))
        );
        if (signInLinks.length > 0) signInLinks[0].click();
      });
      await interactAPI.browserController.wait(2000);
    }

    // Step 3: Check if we need to click Email option
    const needsEmail = await interactAPI.browserController.page.evaluate(() => {
      return document.body.innerText.toLowerCase().includes('sign in with email');
    });

    if (needsEmail) {
      console.log('Clicking Email option...');
      await interactAPI.browserController.page.evaluate(() => {
        const emailButtons = Array.from(document.querySelectorAll('button, a'))
          .filter(el => el.innerText && el.innerText.toLowerCase().includes('email'));
        
        if (emailButtons.length > 0) {
          emailButtons[0].click();
          return true;
        }
        return false;
      });
      await interactAPI.browserController.wait(2000);
    }

    // Step 4: Fill the form using the most direct approach possible
    console.log('Filling login form with username and password...');
    
    // Use direct browser evaluation for filling form
    // This works better than type() in Playwright for React forms
    await interactAPI.browserController.page.evaluate((credentials) => {
      // Step 1: Fill password FIRST (critical for React forms)
      const passwordField = document.querySelector('input[type="password"]');
      if (passwordField) {
        passwordField.focus();
        passwordField.value = credentials.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Step 2: Fill username WITHOUT focusing it
      const usernameField = document.querySelector('input[type="email"], input[type="text"]');
      if (usernameField) {
        usernameField.value = credentials.username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      return {
        passwordFieldFound: !!passwordField,
        usernameFieldFound: !!usernameField
      };
    }, {
      username: interactAPI.config.kaggle.username,
      password: interactAPI.config.kaggle.password
    });
    
    console.log('Fields filled, pressing Enter to submit...');
    
    // Submit form immediately
    await interactAPI.browserController.page.keyboard.press('Enter');
    console.log('Login form submitted');
    
    await interactAPI.browserController.wait(3000);
    console.log('Login process completed');
    
    return true;
  } catch (error) {
    console.error('Login error:', error.message);
    return false;
  }
}

/**
 * Direct fill with verification - fills fields and only submits if both have values
 */
async function verifiedLogin() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }

  // Check credentials
  if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
    console.log('No credentials set. Please set them first.');
    await setCredentials();
  }

  try {
    console.log('STEP 1: Direct fill password first...');
    
    // FIRST FILL PASSWORD (critical for React forms)
    await interactAPI.browserController.page.evaluate((password) => {
      const passwordField = document.querySelector('input[type="password"]');
      if (passwordField) {
        passwordField.focus();
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Password filled:', passwordField.value ? 'YES' : 'NO');
      }
    }, interactAPI.config.kaggle.password);
    
    console.log('STEP 2: Fill username without focusing...');
    
    // THEN FILL USERNAME without focusing first
    await interactAPI.browserController.page.evaluate((username) => {
      const usernameField = document.querySelector('input[type="email"], input[type="text"]');
      if (usernameField) {
        // Fill without focus (important)
        usernameField.value = username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Username filled:', usernameField.value ? 'YES' : 'NO');
      }
    }, interactAPI.config.kaggle.username);
    
    console.log('STEP 3: Verify both fields have values before submission...');
    
    // CRITICAL - Verify both fields have values before proceeding
    const fieldsReady = await interactAPI.browserController.page.evaluate(() => {
      const passwordField = document.querySelector('input[type="password"]');
      const usernameField = document.querySelector('input[type="email"], input[type="text"]');
      
      const passwordValue = passwordField ? passwordField.value : '';
      const usernameValue = usernameField ? usernameField.value : '';
      
      console.log('Field check - Password:', passwordValue ? 'HAS VALUE' : 'EMPTY');
      console.log('Field check - Username:', usernameValue ? 'HAS VALUE' : 'EMPTY');
      
      return {
        passwordReady: passwordValue && passwordValue.length > 0,
        usernameReady: usernameValue && usernameValue.length > 0
      };
    });
    
    console.log(`Verification results:
- Password field has value: ${fieldsReady.passwordReady ? 'YES' : 'NO'}
- Username field has value: ${fieldsReady.usernameReady ? 'YES' : 'NO'}`);
    
    // Only proceed if both fields have values
    if (fieldsReady.passwordReady && fieldsReady.usernameReady) {
      console.log('STEP 4: Both fields verified to have values, pressing Enter...');
      await interactAPI.browserController.page.keyboard.press('Enter');
      console.log('Enter key pressed to submit form');
      await interactAPI.browserController.wait(3000);
      return true;
    } else {
      console.warn('⚠️ Fields not ready for submission - one or both fields are empty');
      
      if (!fieldsReady.passwordReady) {
        console.log('Attempting direct password fill...');
        await interactAPI.browserController.page.type('input[type="password"]', interactAPI.config.kaggle.password, { delay: 20 });
      }
      
      if (!fieldsReady.usernameReady) {
        console.log('Attempting direct username fill...');
        await interactAPI.browserController.page.type('input[type="email"], input[type="text"]', interactAPI.config.kaggle.username, { delay: 20 });
      }
      
      // Verify again
      const retryCheck = await interactAPI.browserController.page.evaluate(() => {
        const passwordField = document.querySelector('input[type="password"]');
        const usernameField = document.querySelector('input[type="email"], input[type="text"]');
        
        return {
          password: passwordField ? passwordField.value : 'not found',
          username: usernameField ? usernameField.value : 'not found',
          bothReady: passwordField?.value?.length > 0 && usernameField?.value?.length > 0
        };
      });
      
      console.log(`Retry verification:
- Password: ${retryCheck.password ? (retryCheck.password.length > 0 ? 'FILLED' : 'EMPTY') : 'NOT FOUND'}
- Username: ${retryCheck.username ? (retryCheck.username.length > 0 ? 'FILLED' : 'EMPTY') : 'NOT FOUND'}`);
      
      if (retryCheck.bothReady) {
        console.log('Fields are now ready, pressing Enter...');
        await interactAPI.browserController.page.keyboard.press('Enter');
        await interactAPI.browserController.wait(3000);
        return true;
      } else {
        console.error('❌ Could not fill both fields properly. Login aborted.');
        return false;
      }
    }
  } catch (error) {
    console.error('Error during verified login:', error.message);
    return false;
  }
}

/**
 * Execute the exact login sequence: click email, fill fields, verify, then submit
 */
async function sequenceLogin() {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }

  // Check credentials
  if (!interactAPI.config.kaggle.username || !interactAPI.config.kaggle.password) {
    console.log('No credentials set. Please set them first.');
    await setCredentials();
  }

  try {
    // STEP 1: First explicitly click the email option
    console.log('STEP 1: Clicking the "Sign in with Email" option first...');
    const emailClicked = await interactAPI.browserController.page.evaluate(() => {
      try {
        // Find any element containing "email" text
        const emailElements = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
          .filter(el => el.innerText && el.innerText.toLowerCase().includes('email'));
        
        if (emailElements.length > 0) {
          console.log('Found email option, clicking it');
          emailElements[0].click();
          return true;
        }
        
        return false;
      } catch (e) {
        console.error('Error clicking email option:', e);
        return false;
      }
    });
    
    if (!emailClicked) {
      console.log('Could not find email option to click, trying to continue anyway');
    } else {
      console.log('Email option clicked successfully');
    }
    
    // Wait for form to appear
    await interactAPI.browserController.wait(2000);
    
    // Function to fill both fields
    const fillBothFields = async () => {
      // STEP 2: Fill password field FIRST
      console.log('STEP 2: Filling password field FIRST...');
      await interactAPI.browserController.page.evaluate((password) => {
        const passwordField = document.querySelector('input[type="password"]');
        if (passwordField) {
          passwordField.focus();
          passwordField.value = password;
          passwordField.dispatchEvent(new Event('input', { bubbles: true }));
          passwordField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, interactAPI.config.kaggle.password);
      
      // STEP 3: Fill username field WITHOUT focusing
      console.log('STEP 3: Filling username field WITHOUT focusing...');
      await interactAPI.browserController.page.evaluate((username) => {
        const usernameField = document.querySelector('input[type="email"], input[type="text"]');
        if (usernameField) {
          usernameField.value = username;
          usernameField.dispatchEvent(new Event('input', { bubbles: true }));
          usernameField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, interactAPI.config.kaggle.username);
    };
    
    // Fill fields first time
    await fillBothFields();
    
    // STEP 4: Wait 200ms as requested
    console.log('STEP 4: Waiting 200ms as requested...');
    await interactAPI.browserController.wait(200);
    
    // STEP 5: Verify both fields have values
    console.log('STEP 5: Verifying both fields have values...');
    const verifyFields = async () => {
      return await interactAPI.browserController.page.evaluate(() => {
        const passwordField = document.querySelector('input[type="password"]');
        const usernameField = document.querySelector('input[type="email"], input[type="text"]');
        
        const passwordValue = passwordField ? passwordField.value : '';
        const usernameValue = usernameField ? usernameField.value : '';
        
        return {
          passwordOK: passwordValue && passwordValue.length > 0,
          usernameOK: usernameValue && usernameValue.length > 0,
          passwordValue: passwordValue ? '****' : '',
          usernameValue: usernameValue || ''
        };
      });
    };
    
    let fieldsOK = await verifyFields();
    
    console.log(`Verification results:
- Password field: ${fieldsOK.passwordOK ? 'FILLED' : 'EMPTY'} ${fieldsOK.passwordValue}
- Username field: ${fieldsOK.usernameOK ? 'FILLED' : 'EMPTY'} ${fieldsOK.usernameValue}`);
    
    // STEP 6: If fields are empty, refill and try again
    if (!fieldsOK.passwordOK || !fieldsOK.usernameOK) {
      console.log('STEP 6: One or more fields are empty, REFILLING both fields...');
      
      // Try alternative fill method
      await interactAPI.browserController.page.evaluate((credentials) => {
        try {
          // Try using different methods to set field values
          const passwordField = document.querySelector('input[type="password"]');
          const usernameField = document.querySelector('input[type="email"], input[type="text"]');
          
          if (passwordField) {
            // Method 1: Direct value setting with property descriptor
            const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            descriptor.set.call(passwordField, credentials.password);
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            passwordField.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Password filled with descriptor');
          }
          
          if (usernameField) {
            // Method 1: Direct value setting
            usernameField.value = credentials.username;
            usernameField.dispatchEvent(new Event('input', { bubbles: true }));
            usernameField.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Username filled with direct value');
          }
        } catch (e) {
          console.error('Error in alternative fill:', e);
        }
      }, {
        username: interactAPI.config.kaggle.username,
        password: interactAPI.config.kaggle.password
      });
      
      // Wait a bit longer after refill
      await interactAPI.browserController.wait(500);
      
      // Verify again
      fieldsOK = await verifyFields();
      
      console.log(`After refill verification:
- Password field: ${fieldsOK.passwordOK ? 'FILLED' : 'EMPTY'} ${fieldsOK.passwordValue}
- Username field: ${fieldsOK.usernameOK ? 'FILLED' : 'EMPTY'} ${fieldsOK.usernameValue}`);
      
      // If still not working, try playwright's fill method
      if (!fieldsOK.passwordOK || !fieldsOK.usernameOK) {
        console.log('STEP 7: Fields still empty, trying Playwright fill API as last resort...');
        
        if (!fieldsOK.passwordOK) {
          await interactAPI.browserController.page.fill('input[type="password"]', interactAPI.config.kaggle.password);
          console.log('Filled password with Playwright API');
        }
        
        if (!fieldsOK.usernameOK) {
          await interactAPI.browserController.page.fill('input[type="email"], input[type="text"]', interactAPI.config.kaggle.username);
          console.log('Filled username with Playwright API');
        }
        
        // Wait after fill
        await interactAPI.browserController.wait(500);
        
        // Verify one more time
        fieldsOK = await verifyFields();
        
        console.log(`After Playwright fill verification:
- Password field: ${fieldsOK.passwordOK ? 'FILLED' : 'STILL EMPTY'} ${fieldsOK.passwordValue}
- Username field: ${fieldsOK.usernameOK ? 'FILLED' : 'STILL EMPTY'} ${fieldsOK.usernameValue}`);
      }
    }
    
    // STEP 8: Submit if both fields are filled, otherwise try anyway
    if (fieldsOK.passwordOK && fieldsOK.usernameOK) {
      console.log('STEP 8: Both fields are filled, pressing Enter to submit...');
    } else {
      console.log('STEP 8: WARNING - Some fields still empty but attempting submission anyway...');
    }
    
    // Try to submit the form regardless
    await interactAPI.browserController.page.keyboard.press('Enter');
    console.log('Form submitted with Enter key');
    
    // Wait for navigation
    await interactAPI.browserController.wait(3000);
    
    return true;
  } catch (error) {
    console.error('Error during sequence login:', error.message);
    return false;
  }
}

/**
 * Demonstrate the complete L2 flow
 */
async function demonstrateL2Flow(searchQuery = 'covid-19 dataset') {
  if (!interactAPI || !interactAPI.isInitialized) {
    console.log('Browser is not initialized. Run "init" first.');
    return;
  }
  
  console.log(`Starting L2 demonstration with search query: "${searchQuery}"...`);
  
  try {
    const result = await interactAPI.demonstrateL2Flow(searchQuery);
    
    if (result.error) {
      console.error(`L2 demonstration failed: ${result.error}`);
    } else {
      console.log('\n✅ L2 DEMONSTRATION COMPLETED SUCCESSFULLY');
      console.log('==============================================');
      
      // Show summary of steps
      result.steps.forEach(step => {
        console.log(`${step.success ? '✓' : '✗'} ${step.step}`);
      });
      
      console.log('\nSee above for detailed outputs from each step.');
      console.log('The demonstration showed a complete flow from login to data extraction.');
    }
  } catch (error) {
    console.error('Error during L2 demonstration:', error.message);
  }
}

// Main function
async function main() {
  showHelp();
  
  // Check if OpenAI API key is set
  if (!config.openai.apiKey || config.openai.apiKey === 'your-api-key-here') {
    console.log('\nWARNING: OpenAI API key is not set. Please set it in .env file.');
  }
  
  // Show notice about the improved natural language processing
  console.log('\n📝 NEW FEATURE - AI Command Mapping');
  console.log('You can now type natural language commands and the system will');
  console.log('map them to the most appropriate predefined command.');
  console.log('Examples:');
  console.log('  "click on the sign in button" → will use "click-signin"');
  console.log('  "login with email" → will use "click-email-option"');
  console.log('  "show the third search result" → will use "show result 3"');
  console.log('  "search for diabetes datasets" → will use "search for diabetes dataset"');
  console.log('\nThis makes commands more reliable while letting you use natural language!\n');
  
  rl.prompt();
  
  rl.on('line', async (line) => {
    const rawCommand = line.trim();
    
    // Normalize input to simplify matching
    const normalizedInput = rawCommand.toLowerCase().trim();
    
    // Handle common sign-in related commands
    
    // Map for different variations of commands
    const commandMap = {
      // Sign in variations
      'click sign in': 'click-signin',
      'click-signin': 'click-signin',
      'click on sign in': 'click-signin',
      'click the sign in button': 'click-signin',
      'sign in': 'click-signin',
      'login': 'click-signin',
      'sign in button': 'click-signin',
      'click login': 'click-signin',
      'click log in': 'click-signin',
      'click on login': 'click-signin',
      
      // Complete sign-in variations
      'kaggle-sign-in': 'kaggle-sign-in',
      'auto-login': 'sequence-login',
      'login to kaggle': 'sequence-login',
      'sign in to kaggle': 'sequence-login',
      'complete login': 'sequence-login',
      'do login': 'sequence-login',
      'sign in automatically': 'sequence-login',
      'sign-in': 'sequence-login',
      
      // Email sign in variations
      'sign in with email': 'sequence-login', // Use the new sequence login
      'click-email-option': 'click-email-option',
      'login with email': 'sequence-login', // Use the new sequence login
      'use email to sign in': 'sequence-login', // Use the new sequence login
      'email sign in': 'sequence-login', // Use the new sequence login
      'click email': 'click-email-option',
      'click on email': 'click-email-option',
      'email login': 'sequence-login', // Use the new sequence login
      'sign in using email': 'sequence-login', // Use the new sequence login,
      
      // Username variations
      'fill username': 'fill-username',
      'fill-username': 'fill-username',
      'enter username': 'fill-username',
      'type username': 'fill-username',
      'input username': 'fill-username',
      'username': 'fill-username',
      'email field': 'fill-username',
      'fill email': 'fill-username',
      
      // Password variations
      'fill password': 'fill-password',
      'fill-password': 'fill-password',
      'enter password': 'fill-password',
      'type password': 'fill-password',
      'input password': 'fill-password',
      'password': 'fill-password',
      
      // Enter/submit variations
      'press enter': 'press-enter',
      'press-enter': 'press-enter',
      'hit enter': 'press-enter',
      'submit': 'press-enter',
      'submit form': 'press-enter',
      'login now': 'press-enter',
      'sign in now': 'press-enter',
      'click submit': 'press-enter',
      'click login button': 'press-enter',
      'click sign in button to submit': 'press-enter',
      
      // Navigation
      'go to kaggle': 'go to kaggle.com',
      'navigate to kaggle': 'go to kaggle.com',
      'open kaggle': 'go to kaggle.com',
      'go to kaggle website': 'go to kaggle.com',
      'kaggle.com': 'go to kaggle.com',
      'go to kaggle.com': 'go to kaggle.com',
      
      // Credentials
      'fill both fields': 'sequence-login',
      'fill credentials': 'sequence-login',
      'fill-credentials': 'sequence-login',
      'enter credentials': 'sequence-login',
      'fill login details': 'sequence-login',
      'login with credentials': 'sequence-login',
      'use credentials': 'sequence-login',
      'direct-login': 'sequence-login',
      'sequence-login': 'sequence-login',
      
      // L2 demonstration
      'demonstrate-l2': 'demonstrate-l2',
      'l2-demo': 'demonstrate-l2',
      'run-l2-flow': 'demonstrate-l2',
      'show-l2': 'demonstrate-l2',
      'complete-demo': 'demonstrate-l2',
      'run full demonstration': 'demonstrate-l2',
      'demonstrate full flow': 'demonstrate-l2',
      'demo l2': 'demonstrate-l2',
      'l2 demo': 'demonstrate-l2',
      'run complete flow': 'demonstrate-l2',
    };
    
    // Check if the command exists in our map
    const mappedCommand = commandMap[normalizedInput];
    if (mappedCommand) {
      console.log(`\n✅ Mapped "${normalizedInput}" to command: "${mappedCommand}"\n`);
      
      // Execute the mapped command
      switch (mappedCommand) {
        case 'click-signin':
          await clickSignInButton();
          break;
        case 'click-email-option':
          await clickEmailOption();
          break;
        case 'fill-username':
          await fillUsername();
          break;
        case 'fill-password':
          await fillPassword();
          break;
        case 'press-enter':
          await pressEnterToSubmit();
          break;
        case 'fill-credentials':
          await fillCredentials();
          break;
        case 'go to kaggle.com':
          if (!interactAPI || !interactAPI.isInitialized) {
            console.log('Browser is not initialized. Run "init" first.');
          } else {
            await interactAPI.executeCommand('go to kaggle.com');
          }
          break;
        case 'kaggle-sign-in':
          await kaggleSignIn();
          break;
        case 'email-and-fill':
          await emailOptionAndFillCredentials();
          break;
        case 'simplified-login':
          await simplifiedLogin();
          break;
        case 'verified-login':
          await verifiedLogin();
          break;
        case 'sequence-login':
          await sequenceLogin();
          break;
        case 'demonstrate-l2':
        case 'l2-demo':
        case 'run-l2-flow':
          // Extract a custom search query if provided
          const demoQuery = command.split(' ').slice(1).join(' ').trim();
          await demonstrateL2Flow(demoQuery || 'covid-19 dataset');
          return;
        default:
          // If it's somehow in our map but not handled, pass to the normal command handler
      }
      
      rl.prompt();
      return;
    }
    
    // Process commands that weren't directly mapped
    await processOpenAICommand(rawCommand);
    rl.prompt();
  }).on('close', async () => {
    if (interactAPI) {
      await interactAPI.close();
    }
    console.log('\nGoodbye!');
    process.exit(0);
  });

  // Handle errors
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    if (interactAPI) {
      await interactAPI.close();
    }
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

// Separate function to process commands with OpenAI if needed
async function processOpenAICommand(command) {
  try {
    // Map using OpenAI
    const mappedCommand = await mapToExactCommand(command);
    
    // Handle built-in commands
    switch (mappedCommand.toLowerCase()) {
      case 'help':
        showHelp();
        break;
        
      case 'exit':
      case 'quit':
        if (interactAPI) {
          await interactAPI.close();
        }
        rl.close();
        console.log('Goodbye!');
        process.exit(0);
        break;
        
      case 'history':
        console.log('\nCommand History:');
        history.forEach((cmd, index) => {
          console.log(`${index + 1}. ${cmd}`);
        });
        break;
        
      case 'clear':
        console.clear();
        break;
        
      case 'init':
        await initializeBrowser();
        break;
        
      case 'close':
        if (interactAPI) {
          await interactAPI.close();
          console.log('Browser closed.');
          interactAPI = null;
        } else {
          console.log('Browser is not initialized.');
        }
        break;
        
      case 'check-credentials':
        checkCredentials();
        break;
        
      case 'set-credentials':
        await setCredentials();
        break;
        
      case 'kaggle-login':
        await performKaggleLogin();
        break;
      
      case 'help-search-results':
        console.log('\nSearch Results Commands:');
        console.log('  show-results            - Display all search results in a formatted way');
        console.log('  show result <number>    - Show detailed information about a specific result');
        console.log('  click_result <number>   - Click on a specific search result by number');
        console.log('  print page content      - Display formatted results on search pages');
        console.log('  search for <term>       - Perform a search using direct URL navigation');
        console.log('  kaggle-search <term>    - Alias for search for <term>');
        console.log('\nExample usage:');
        console.log('  search for covid-19 dataset');
        console.log('  show-results');
        console.log('  show result 3           # Display detailed info about the third result');
        console.log('  click_result 2          # Click on the second result to open it');
        break;
        
      case 'help-ai':
      case 'ai-help':
        console.log('\nAI-powered Content Analysis Commands:');
        console.log('  analyze page                 - Use AI to analyze the current page');
        console.log('  tell me about this page      - AI-powered page content summary');
        console.log('  explain search results       - AI analysis of search results');
        console.log('  tell me about result <num>   - AI analysis of specific search result');
        console.log('  summarize result <num>       - Summarize a specific search result');
        console.log('  explain result <num>         - Detailed explanation of a specific result');
        console.log('\nThese commands use OpenAI to provide more detailed and user-friendly analysis of page content.');
        break;
        
      default:
        // If it's not a built-in command, pass it to the browser automation
        if (!interactAPI || !interactAPI.isInitialized) {
          console.log('Browser is not initialized. Run "init" first.');
          break;
        }
        
        try {
          // Special check for click_result command with a number
          if (command.startsWith('click_result ') || command.startsWith('show result ')) {
            // This is a command with a number parameter, handle it directly
            console.log(`Executing command: ${command}`);
            await interactAPI.executeCommand(command);
          } else if (command.startsWith('kaggle-search ')) {
            // Extract the search term
            const searchTerm = command.substring('kaggle-search '.length).trim();
            await kaggleSearch(searchTerm);
          } else {
            // For regular commands, execute through the API
            await interactAPI.executeCommand(command);
          }
        } catch (error) {
          console.error(`Error executing command: ${error.message}`);
        }
    }
  } catch (error) {
    console.error(`Error processing command: ${error.message}`);
  }
}

main(); 