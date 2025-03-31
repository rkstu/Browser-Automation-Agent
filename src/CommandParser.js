/**
 * Handles the parsing of a natural language command into a structured action
 */
async parseCommandToAction(command) {
  try {
    // ... existing code ...

    // Check for search result commands
    const showResultsRegex = /^(show|display|list|extract|get|print)\s+(search\s+)?(results|search results)$/i;
    if (showResultsRegex.test(command)) {
      return {
        action: 'extract_results',
        target: 'search results',
        value: null,
        description: 'Extract and display search results from the current page'
      };
    }

    // Check for click on search result command
    const clickResultRegex = /^(click|select|choose|open)\s+(on\s+)?(the\s+)?(\d+(?:st|nd|rd|th)?\s+)?(result|search result|item)(?:\s+(\d+))?$/i;
    const clickResultMatch = command.match(clickResultRegex);
    
    if (clickResultMatch) {
      // Extract the result number from different possible positions in the command
      let resultNumber = clickResultMatch[6] ? parseInt(clickResultMatch[6], 10) : null;
      
      if (!resultNumber && clickResultMatch[4]) {
        // Try to extract from position format like "1st", "2nd", "3rd", "4th"
        const numStr = clickResultMatch[4].trim().replace(/st|nd|rd|th/i, '');
        resultNumber = parseInt(numStr, 10);
      }
      
      // Default to first result if no number specified
      resultNumber = resultNumber || 1;
      
      return {
        action: 'click_result',
        target: resultNumber.toString(),
        value: null,
        description: `Click on search result #${resultNumber}`
      };
    }

    // Check for direct click_result command
    if (/^click_result\s+\d+$/i.test(command)) {
      const resultNumber = parseInt(command.split(/\s+/)[1], 10);
      return {
        action: 'click_result',
        target: resultNumber.toString(),
        value: null,
        description: `Click on search result #${resultNumber}`
      };
    }

    // ... rest of existing code ...
  }
  // ... existing error handling ...
}

// ... rest of existing code ... 