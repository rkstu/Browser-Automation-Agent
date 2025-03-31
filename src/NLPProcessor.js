const { OpenAI } = require('openai');
const config = require('./config/config');

/**
 * NLPProcessor handles natural language processing to convert 
 * user commands into structured actions
 */
class NLPProcessor {
  constructor(options = {}) {
    this.options = {
      ...config,
      ...options
    };
    
    // Check for OpenAI API key
    if (!this.options.openai.apiKey || this.options.openai.apiKey === 'your-api-key-here') {
      console.error('WARNING: OpenAI API key is not set or is using the placeholder value.');
      console.error('Please set a valid API key in your .env file or pass it in the options.');
      throw new Error('OpenAI API key not properly configured');
    }
    
    // Initialize OpenAI client
    try {
      this.openai = new OpenAI({
        apiKey: this.options.openai.apiKey,
      });
      console.log('OpenAI client initialized with API key');
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error.message);
      throw error;
    }
    
    // Define predefined commands with descriptions for command mapping
    this.predefinedCommands = [
      // Kaggle login commands
      { command: 'click-signin', description: 'Click the Sign In button on Kaggle homepage' },
      { command: 'click-email-option', description: 'Click the "Sign in with Email" option' },
      { command: 'fill-username', description: 'Fill in username/email field on login form' },
      { command: 'fill-password', description: 'Fill in password field on login form' },
      { command: 'press-enter', description: 'Press Enter to submit a form' },
      { command: 'fill-credentials', description: 'Fill both username and password fields' },
      { command: 'direct-login', description: 'Direct method to fill credentials and submit (most reliable)' },
      { command: 'kaggle-login', description: 'Perform Kaggle login (navigate + sign in + enter credentials)' },
      
      // Search and results commands
      { command: 'show-results', description: 'Display all search results in a formatted way' },
      { command: 'help-search-results', description: 'Show detailed help for search result commands' },
      { command: 'click_result 1', description: 'Click on the first search result' },
      { command: 'click_result 2', description: 'Click on the second search result' },
      { command: 'click_result 3', description: 'Click on the third search result' },
      { command: 'show result 1', description: 'Show detailed info about the first result' },
      { command: 'show result 2', description: 'Show detailed info about the second result' },
      { command: 'show result 3', description: 'Show detailed info about the third result' },
      
      // AI and help commands
      { command: 'help-ai', description: 'Show AI-powered content analysis commands' },
      { command: 'tell me about this page', description: 'AI-generated summary of the current page' },
      { command: 'explain search results', description: 'Smart analysis of search results' },
      { command: 'tell me about result 1', description: 'Detailed AI analysis of first result' },
      { command: 'tell me about result 2', description: 'Detailed AI analysis of second result' },
      { command: 'tell me about result 3', description: 'Detailed AI analysis of third result' },
      
      // Browser control commands
      { command: 'init', description: 'Initialize the browser' },
      { command: 'close', description: 'Close the browser' },
      { command: 'help', description: 'Show help message' },
      
      // Navigation and basic actions
      { command: 'search for diabetes dataset', description: 'Search for diabetes dataset on Kaggle' },
      { command: 'go to kaggle.com', description: 'Navigate to Kaggle homepage' }
    ];
  }

  /**
   * Process a natural language command
   * @param {string} command - The command to process
   * @returns {Promise<Object>} - The parsed command
   */
  async processCommand(command) {
    try {
      // First, try to match with a predefined command using AI
      const matchedCommand = await this.matchCommandWithOpenAI(command);
      if (matchedCommand) {
        console.log(`Matched natural language input to predefined command: ${matchedCommand}`);
        return {
          action: 'execute_predefined',
          target: matchedCommand,
          value: null,
          description: `Execute predefined command: ${matchedCommand}`
        };
      }
      
      // Check for clear AI-related command patterns
      if (/^(analyze|tell\s+me\s+about|explain|describe|summarize)\s+(this\s+)?page(\s+content)?$/i.test(command)) {
        return {
          action: 'analyze_page',
          target: 'page',
          value: null,
          description: 'Analyze the current page content with AI'
        };
      }
      
      if (/^(analyze|tell\s+me\s+about|explain|describe|summarize)\s+(the\s+)?(search\s+)?results$/i.test(command)) {
        return {
          action: 'analyze_results',
          target: 'search_results',
          value: null,
          description: 'Analyze search results with AI'
        };
      }
      
      // Match pattern for analyzing specific result
      // This version supports both numeric (result 3) and ordinal (third result) formats
      // Also handles variations like "contents of" or "in the page" 
      const resultPatterns = [
        // Match "tell me about result 3" or "analyze result 3"
        /^(analyze|tell\s+me\s+about|explain|describe|summarize|show|print|check)\s+(the\s+)?(search\s+)?result\s+(\d+).*$/i,
        
        // Match "tell me about the third result" with ordinal numbers
        /^(analyze|tell\s+me\s+about|explain|describe|summarize|show|print|check)(?:\s+(?:the|me))?\s+(?:contents\s+of\s+)?(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|sixth|seventh|eighth|ninth|tenth|6th|7th|8th|9th|10th)\s+(?:search\s+)?result.*$/i,
        
        // Match "tell me about result number 3"
        /^(analyze|tell\s+me\s+about|explain|describe|summarize|show|print|check)\s+(?:the\s+)?(?:search\s+)?result\s+(?:number\s+)?(\d+).*$/i
      ];
      
      for (const pattern of resultPatterns) {
        const match = command.match(pattern);
        if (match) {
          // Extract the result number
          let resultNumber;
          
          if (match[4] && /^\d+$/.test(match[4])) {
            // If it's a direct number in the 4th group
            resultNumber = parseInt(match[4], 10);
          } else if (match[2] && /^\d+$/.test(match[2])) {
            // If it's a direct number in the 2nd group
            resultNumber = parseInt(match[2], 10);
          } else if (match[2]) {
            // If it's an ordinal word, convert to number
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
            
            resultNumber = ordinalMap[match[2].toLowerCase()];
          } else {
            // As a fallback, try to find any number in the command
            const numberMatch = command.match(/\d+/);
            if (numberMatch) {
              resultNumber = parseInt(numberMatch[0], 10);
            } else {
              resultNumber = 1; // Default to the first result
            }
          }
          
          // Determine if this is an analyze or show command
          const action = /^(analyze|tell\s+me\s+about|explain|describe|summarize)/i.test(match[1]) 
            ? 'analyze_result' 
            : 'show_result';
            
          return {
            action: action,
            target: resultNumber.toString(),
            value: null,
            description: `${action === 'analyze_result' ? 'Analyze' : 'Show'} search result #${resultNumber} with AI`
          };
        }
      }
      
      // Delegate to the original command processing if not an AI command
      return await this._originalProcessCommand(command);
    } catch (error) {
      console.error('Error processing command:', error);
      throw error;
    }
  }
  
  /**
   * Original command processing logic
   * @param {string} command - The command to process
   * @returns {Promise<Object>} - The parsed command
   * @private
   */
  async _originalProcessCommand(command) {
    try {
      // Normalize the command
      const normalizedCommand = command.toLowerCase().trim();
      
      // Handle navigation commands
      if (normalizedCommand.startsWith('go to ') || 
          normalizedCommand.startsWith('navigate to ') || 
          normalizedCommand.startsWith('open ')) {
        const target = normalizedCommand.replace(/^(go to |navigate to |open )/, '').trim();
        return {
          action: 'navigate',
          target: target,
          value: null,
          description: `Navigate to ${target}`
        };
      }
      
      // Handle click commands
      if (normalizedCommand.startsWith('click ') || 
          normalizedCommand.includes('click on ')) {
        const target = normalizedCommand.replace(/^click /, '')
                                       .replace(/click on /, '')
                                       .trim();
        return {
          action: 'click',
          target: target,
          value: null,
          description: `Click on ${target}`
        };
      }
      
      // Handle typing commands
      if (normalizedCommand.startsWith('type ') || 
          normalizedCommand.includes('enter ')) {
        let target = '';
        let value = '';
        
        if (normalizedCommand.includes(' in ')) {
          const parts = normalizedCommand.split(' in ');
          value = parts[0].replace(/^type /, '').trim();
          target = parts[1].trim();
        } else if (normalizedCommand.includes(' into ')) {
          const parts = normalizedCommand.split(' into ');
          value = parts[0].replace(/^type /, '').trim();
          target = parts[1].trim();
        } else {
          // Default to a search box if not specified
          const valuePart = normalizedCommand.replace(/^type /, '').replace(/^enter /, '').trim();
          target = 'search box';
          value = valuePart;
        }
        
        return {
          action: 'type',
          target: target,
          value: value,
          description: `Type ${value} in ${target}`
        };
      }
      
      // Handle search commands with common typos
      const searchPattern = /s[ae](?:a|e|r|er|ar)ch/i; // Matches search, saerch, serch, seach, etc.
      if (searchPattern.test(normalizedCommand)) {
        // Extract the search term - everything after "search" or its misspelling
        const match = normalizedCommand.match(new RegExp(`${searchPattern.source}\\s+(?:for\\s+)?(.+)`, 'i'));
        const searchTerm = match && match[1] ? match[1].trim() : '';
        
        if (searchTerm) {
          return {
            action: 'search',
            target: searchTerm,
            value: null,
            description: `Search for ${searchTerm}`
          };
        }
      }
      
      // Handle extraction commands
      if (normalizedCommand.startsWith('extract ') || 
          normalizedCommand.startsWith('get ')) {
        const target = normalizedCommand.replace(/^extract /, '')
                                       .replace(/^get /, '')
                                       .trim();
        return {
          action: 'extract',
          target: target,
          value: null,
          description: `Extract ${target}`
        };
      }
      
      // Handle wait commands
      if (normalizedCommand.startsWith('wait ')) {
        let value = 1000; // Default to 1 second
        
        // Try to extract a numeric value
        const match = normalizedCommand.match(/\d+/);
        if (match) {
          value = parseInt(match[0], 10);
          
          // Convert to milliseconds if in seconds
          if (normalizedCommand.includes('second')) {
            value *= 1000;
          }
        }
        
        return {
          action: 'wait',
          target: null,
          value: value,
          description: `Wait for ${value} milliseconds`
        };
      }
      
      // Handle press Enter command
      if (normalizedCommand.includes('press enter') || 
          normalizedCommand.includes('hit enter')) {
        return {
          action: 'press',
          target: 'enter',
          value: null,
          description: 'Press Enter key'
        };
      }
      
      // Handle screenshot command
      if (normalizedCommand.includes('screenshot') || 
          normalizedCommand.includes('take a picture')) {
        return {
          action: 'screenshot',
          target: null,
          value: 'screenshot.png',
          description: 'Take a screenshot'
        };
      }
      
      // Handle specific result commands
      const resultMatch = normalizedCommand.match(/click(?:\son)?\s+(?:the\s+)?(?:(\d+)(?:st|nd|rd|th))?\s*(?:search\s+)?result/i);
      if (resultMatch) {
        const resultNumber = resultMatch[1] ? parseInt(resultMatch[1], 10) : 1;
        return {
          action: 'click_result',
          target: resultNumber.toString(),
          value: null,
          description: `Click on search result #${resultNumber}`
        };
      }
      
      // Handle show results command
      if (normalizedCommand.includes('show') && 
          (normalizedCommand.includes('results') || normalizedCommand.includes('search results'))) {
        return {
          action: 'show_results',
          target: null,
          value: null,
          description: 'Show search results'
        };
      }
      
      // Default action: try to find the most reasonable interpretation
      if (normalizedCommand.includes('search')) {
        // Extract the search term - everything after "search"
        const searchTerm = normalizedCommand.substring(normalizedCommand.indexOf('search') + 6).trim();
        return {
          action: 'search',
          target: searchTerm,
          value: null,
          description: `Search for ${searchTerm}`
        };
      }
      
      if (normalizedCommand.includes('click')) {
        // Extract the target - everything after "click"
        const target = normalizedCommand.substring(normalizedCommand.indexOf('click') + 5).trim();
        return {
          action: 'click',
          target: target,
          value: null,
          description: `Click on ${target}`
        };
      }
      
      // When all else fails, log a warning and return an unsafe parse
      console.warn('Could not safely parse command, using best guess:', normalizedCommand);
      return {
        action: 'navigate', // Default to navigation as the safest action
        target: normalizedCommand,
        value: null,
        description: `Navigate to ${normalizedCommand}`
      };
    } catch (error) {
      console.error('Error parsing command:', error);
      throw error;
    }
  }

  /**
   * Match a natural language command to a predefined command using OpenAI
   * @param {string} userInput - The natural language command
   * @returns {Promise<string|null>} - The matched command or null if no match found
   * @private
   */
  async matchCommandWithOpenAI(userInput) {
    // Disable this function since we're now handling mapping at the CLI level
    console.log('Command mapping now handled at CLI level');
    return null;
    
    // The code below is kept for reference but will not execute
    /*
    try {
      // Format commands for the prompt
      const commandsFormatted = this.predefinedCommands.map(cmd => 
        `- ${cmd.command}: ${cmd.description}`
      ).join('\n');
      
      // Create prompt for OpenAI
      const prompt = `Given the user input: "${userInput}"

You need to match it to the most appropriate predefined command from the list below.
The predefined commands perform specific actions in a browser automation system.

Examples of matching:
- "I want to sign in to Kaggle" → "click-signin"
- "Click on sign in button" → "click-signin"
- "Login with email" → "click-email-option"
- "Click the first search result" → "click_result 1"
- "Click the fourth result" → "click_result 4" (even if click_result 4 isn't in the list)
- "Show me details about result 5" → "show result 5" (even if show result 5 isn't in the list)
- "Tell me what this page is about" → "tell me about this page"
- "Search for datasets about diabetes" → "search for diabetes dataset"

For commands with numbers (like click_result or show result), adjust the number based on the user input, 
even if that exact numbered command is not in the command list.

Return ONLY the EXACT command string without any explanation, quotes or additional text.
If you're not confident about the match, return "NO_MATCH".

Available commands:
${commandsFormatted}`;
      
      const response = await this.openai.chat.completions.create({
        model: this.options.openai.model,
        messages: [
          { role: "system", content: "You are a command matching assistant for a browser automation system. Your job is to precisely match natural language input to specific predefined commands." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2, // Even lower temperature for more consistent results
        max_tokens: 50,   // We only need a short response
      });
      
      const result = response.choices[0].message.content.trim();
      
      // Check if AI didn't find a match
      if (result === "NO_MATCH") {
        return null;
      }
      
      // Check for exact matches in our predefined list first
      if (this.predefinedCommands.some(cmd => cmd.command === result)) {
        return result;
      }
      
      // For commands like 'click_result N' or 'show result N' where N may vary
      // Check if it's a valid pattern even if the specific number wasn't in our examples
      const clickResultMatch = result.match(/^click_result\s+(\d+)$/i);
      if (clickResultMatch) {
        return result; // Return the full command with the number
      }
      
      const showResultMatch = result.match(/^show\s+result\s+(\d+)$/i);
      if (showResultMatch) {
        return result; // Return the full command with the number
      }
      
      const tellAboutResultMatch = result.match(/^tell\s+me\s+about\s+result\s+(\d+)$/i);
      if (tellAboutResultMatch) {
        return result; // Return the full command with the number
      }
      
      // If we get here, AI returned something not recognized
      console.warn(`AI returned invalid command: ${result}`);
      return null;
    } catch (error) {
      console.error('Error matching command with OpenAI:', error);
      return null; // Fall back to regular parsing on error
    }
    */
  }
}

module.exports = NLPProcessor; 