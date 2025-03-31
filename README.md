# Browser Automation Agent

An AI agent that automates browser workflows through natural language commands, progressively enhancing capabilities from basic control to advanced contextual intelligence.

## Problem Statement

Web automation traditionally requires writing complex code with detailed selectors and precise command sequences. This creates several challenges:

1. High technical barrier for non-developers
2. Brittle implementations that break with website changes
3. Difficulty maintaining automation scripts
4. Limited ability to extract structured data from modern dynamic websites

This project solves these problems by creating a natural language interface for browser control and data extraction, allowing users to interact with web applications using simple English commands.

## Implementation Levels

### Level 1 - Basic Browser Control
We've implemented the minimum requirements for basic browser control:

- **Interact API**: Built an API that translates natural language commands into browser actions
- **Error Handling**: Properly handles common errors with clear error messages
- **Complete Flow Demonstration**: Shows a workflow that:
  - Logs into Kaggle with robust handling of dynamic React forms
  - Performs searches with user-specified keywords
  - Navigates through search results
  - Interacts with specific result items

### Level 2 - Advanced Browser Integration
We've also implemented the advanced requirements:

- **Direct Browser Control**: Controls native browsers through their browser-specific interfaces
- **Extract API**: Extracts structured data from web pages with AI enhancement
- **Complete Flow Demonstration**: Shows a workflow that:
  - Logs into Kaggle using a robust sequence-based login
  - Performs searches with user-specified keywords
  - Navigates through search results
  - Parses and extracts information in structured JSON format
  - Uses AI to analyze and enhance extracted data

## Features

- **Natural Language Control**: Control browsers using plain English commands
- **Cross-Browser Support**: Works with Chromium, Firefox, and WebKit
- **Smart Error Handling**: Intelligent error recovery with helpful suggestions
- **Session Management**: Maintains browser state between commands
- **Extensible Architecture**: Designed for progressive enhancement
- **Anti-Detection Measures**: Simulates human-like behavior to avoid bot detection
- **CAPTCHA Handling**: Detects and helps manage CAPTCHA challenges
- **Interactive Mode**: Allows human intervention for solving CAPTCHAs and other challenges
- **Typo Tolerance**: Handles common command typos (e.g., "saerch" → "search")
- **AI-Enhanced Data Extraction**: Uses OpenAI to structure and analyze web content

## Installation

```bash
# Clone the repository
git clone https://github.com/rkstu/Browser-Automation-Agent.git
cd browser-automation-agent

# Install dependencies
npm install

# Set up your environment variables
cp .env.example .env
# Edit .env with your OpenAI API key
```

## Quick Start

### CLI Mode

The easiest way to get started is to use the CLI:

```bash
# Start the CLI
npm start

# In the CLI
> init
> go to kaggle.com
> click sign in
> click-email-option
> fill-username
> fill-password
> press-enter
> search for covid-19 dataset
> show-results
> show result 2
```

### Programmatic Usage

```javascript
const { InteractAPI } = require('browser-automation-agent');

async function runSimpleWorkflow() {
  const interact = new InteractAPI();
  
  try {
    // Initialize the browser
    await interact.initialize();
    
    // Execute commands using natural language
    await interact.executeCommand('go to kaggle.com');
    await interact.executeCommand('click sign in');
    await interact.executeCommand('fill-credentials');
    
    // Search and extract data
    await interact.executeCommand('search for covid-19 dataset');
    const results = await interact.displayFormattedSearchResults();
    console.log('Search results:', results);
    
    // Analyze with AI
    const analysis = await interact.parseSpecificResultWithAI(1);
    console.log('AI analysis:', analysis);
    
  } finally {
    // Always close the browser
    await interact.close();
  }
}

runSimpleWorkflow().catch(console.error);
```

## Technical Implementation

### Architecture

The project uses a modular architecture with several key components:

```
Browser Automation Agent
│
├── CLI Interface
│   └── Command Processing
│
├── Interact API
│   ├── NLP Processor
│   ├── Browser Controller
│   └── Error Handler
│
├── Extraction API
│   └── Data Parsers
│
└── Browser Factory
    └── Native Browser Integration
```

### Core Components

#### 1. Command Line Interface (CLI)
The CLI provides a user-friendly interface with:
- Natural language command entry
- Command history tracking
- Command suggestions
- Help documentation
- Screenshot on demand

#### 2. InteractAPI
The main interface between user commands and browser actions:
- Processes natural language commands
- Maps commands to browser actions
- Manages browser sessions
- Handles errors and recovery
- Implements complex workflows

#### 3. Browser Controller
Manages direct browser interactions:
- Browser initialization
- Navigation
- Element finding and clicking
- Form filling
- Screenshot taking
- Keyboard input simulation

#### 4. NLP Processor
Converts natural language to structured commands:
- Command intent detection
- Parameter extraction
- Command validation
- Fallback mechanisms for ambiguous commands

#### 5. Extraction API
Extracts structured data from web pages:
- Search result parsing
- Content extraction
- AI-enhanced data interpretation
- JSON formatting

### Key Technologies Used

- **Node.js**: Core runtime environment
- **Playwright**: Browser automation library that provides cross-browser support
- **OpenAI API**: Natural language processing for command understanding
- **Chrome DevTools Protocol**: Direct browser control interface
- **HTML/DOM Manipulation**: For robust data extraction

## Anti-Detection Features

The browser automation agent includes several features to avoid bot detection:

- **Human-like mouse movements**: Uses realistic cursor paths with Bezier curves
- **Variable typing speeds**: Types at different speeds like a human would
- **Random delays**: Adds natural pauses between actions
- **Stealth mode**: Disguises automation signals that websites use to detect bots
- **Realistic browser fingerprints**: Modifies navigator properties to appear more human-like
- **Occasional "typos"**: Can simulate human typing mistakes and corrections

## Error Handling and Recovery

The system implements a comprehensive error handling strategy:

1. **Defensive Programming**: Preemptive error checks before actions
2. **Exception Handling**: try/catch blocks throughout the codebase
3. **Graceful Degradation**: Fallback mechanisms when primary approaches fail
4. **Type Checking**: Runtime verification of input and function existence
5. **User Feedback**: Clear error messages with suggestions
6. **Recovery Strategies**: Alternative approaches when a command fails

For example, in search functionality:
- Handles common typos in search commands ("saerch" → "search")
- Provides direct URL navigation when UI interactions fail
- Implements multiple methods to identify and click search results
- Verifies field values before form submission

## Advanced Login Handling

Kaggle's React-based login form presented unique challenges that required sophisticated solutions:

1. **Password-First Approach**: Filling password fields before username to prevent React state resets
2. **Field Verification**: Validating field content before submission
3. **Event Simulation**: Proper event dispatching to trigger React state updates
4. **Multi-Method Login**: Several fallback strategies when primary login approaches fail

Our enhanced login system includes:

- **Multiple Fill Attempts**: Tries up to 3 different approaches to fill form fields
- **Clear-and-Fill Strategy**: Ensures clean field state before each attempt
- **Direct DOM Manipulation**: Last-resort method when standard approaches fail
- **Multiple Login Verification Methods**: Checks login success through various indicators
- **Post-Login Verification**: Confirms successful login before proceeding
- **Recovery Actions**: Tries alternative submission methods if initial submission fails

## CAPTCHA Handling

When a CAPTCHA is detected, the agent:

1. Notifies you that a CAPTCHA needs to be solved
2. Activates "User Intervention Mode" waiting for you to manually solve it
3. Automatically continues automation after the CAPTCHA is solved
4. Provides visual indication in the console for when intervention is needed

## Project Structure

```
/src
  /config       - Configuration files
  /utils        - Utility functions including BrowserUtils for human simulation
  /examples     - Example workflows
  /tests        - Test cases
  index.js      - Main entry point
  cli.js        - CLI interface
  InteractAPI.js - Main API for natural language commands
  BrowserController.js - Browser control implementation with anti-detection features
  CommandParser.js - Command parsing and processing
  NLPProcessor.js - Natural language processing and AI integration
```

## Available Commands

Here are some example commands you can use:

### Navigation Commands
- `go to kaggle.com` - Navigate to Kaggle
- `back` - Go back to previous page
- `forward` - Go forward to next page
- `refresh` - Refresh the current page

### Authentication Commands
- `click sign in` - Click the sign in button
- `click-email-option` - Click the "Sign in with Email" option
- `fill-username` - Fill the username field
- `fill-password` - Fill the password field
- `press-enter` - Press the Enter key to submit a form
- `sequence-login` - Execute the complete login sequence
- `direct-login` - Use the most reliable login method

### Search Commands
- `search for covid-19 dataset` - Search for a term
- `show-results` - Display all search results
- `show result 3` - Show detailed information about a specific result
- `click_result 2` - Click on a specific search result by number

### Data Extraction Commands
- `extract formatted search results` - Extract and structure search results
- `parse specific result with AI 2` - Use AI to analyze a specific result
- `display specific result 1` - Display detailed information about a result

### Utility Commands
- `take-screenshot` - Take a screenshot
- `set-credentials` - Set your login credentials
- `help` - Display help information
- `demonstrate-l1` - Run the Level 1 demonstration flow
- `demonstrate-l2` - Run the Level 2 demonstration flow

## Natural Language Command Processing

The system features advanced AI-powered command mapping:

```
> I want to sign in to Kaggle
✅ AI matched your natural language command to: "click-signin"
Executing this command now...
```

This feature:

- Uses OpenAI to map natural language to specific predefined commands
- Handles variations in wording (e.g., "log in to Kaggle", "click sign in button")
- Works with parameterized commands (e.g., "show the third result" → "show result 3")
- Falls back to regular command processing if no specific match is found

The system comes with predefined commands specifically optimized for common tasks:
- `click-signin`: Reliably clicks the sign-in button (more reliable than "click sign in")
- `click-email-option`: Clicks the email sign-in option
- `fill-password`: Fills the password field (Note: we fill password first for reliability)
- `fill-username`: Fills the username field
- `kaggle-login`: Performs the complete login sequence

## Complete Workflow Demonstrations

### L1 Flow: Basic Browser Control
The system demonstrates a complete L1 workflow with the `demonstrate-l1` command:

1. **Browser Initialization**: Starts a browser session
2. **Navigation**: Goes to Kaggle.com
3. **Login**: Authenticates using stored credentials
4. **Search**: Performs a search for "data science competition"
5. **Result Interaction**: Clicks on a specific search result
6. **Screenshot**: Takes a screenshot for verification

### L2 Flow: Advanced Integration with Data Extraction
The `demonstrate-l2` command shows the more advanced capabilities:

1. **Direct Browser Control**: Uses browser-specific protocols
2. **Login**: Uses the robust sequence-login method
3. **Search**: Performs direct search with URL navigation
4. **Data Extraction**: Extracts structured information from search results
5. **AI Analysis**: Enhances the extracted data with AI interpretation
6. **JSON Output**: Returns the data in structured format

## Roadmap

Upcoming features:

- **Level 2: Complete Advanced Browser Integration**
  - Enhanced data extraction capabilities
  - Proxy and extension support
  
- **Level 3: Contextual Intelligence**
  - Cross-platform compatibility improvements
  - Task scheduling capabilities
  - Conversational context management

## Best Practices for Avoiding Detection

1. **Add realistic delays between actions**: Never perform actions too quickly
2. **Use human-like mouse movements**: Avoid perfectly straight paths
3. **Vary typing speeds**: Humans don't type at consistent speeds
4. **Avoid predictable patterns**: Add some randomness to your automation
5. **Handle CAPTCHA challenges**: Be prepared to solve CAPTCHAs manually

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
