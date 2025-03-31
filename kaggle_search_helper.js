// Kaggle Search Helper
// This script helps identify and interact with Kaggle search results

/**
 * Function to find and analyze search results on Kaggle
 * Returns detailed information about the results and provides functions to interact with them
 */
async function analyzeKaggleSearchResults(page) {
  console.log('Analyzing Kaggle search results structure...');
  
  // Take a screenshot to help debugging
  await page.screenshot({ path: 'test_images/kaggle-search-analysis.png' });
  
  // Different possible selectors for search results
  const possibleSelectors = [
    // Cards/list items in search results
    '.mdc-card',                           // Material design cards
    '.mdc-list-item',                      // Material design list items
    '[data-testid="search-results"] > div', // Using the data-testid
    '.sc-jdUcAg',                          // Potential class for result items
    // Full result containers
    '[data-testid="search-results"]',      // The main search results container
    '[data-component-name="SearchResults"]', // By component name
    // Fallbacks
    '.search-results',                     // Generic class name
    '#site-content .mdc-card, #site-content .mdc-list-item' // Within site content
  ];
  
  // Try to find search results using different selectors
  const results = await page.evaluate((selectors) => {
    // Function to log and return element details
    const getElementDetails = (elements, selectorUsed) => {
      console.log(`Found ${elements.length} elements with selector: ${selectorUsed}`);
      
      return {
        count: elements.length,
        selector: selectorUsed,
        items: Array.from(elements).map((el, index) => {
          // Get rectangle information
          const rect = el.getBoundingClientRect();
          
          // Get text content
          const title = el.querySelector('h3, h4, [role="heading"], .title') 
            ? el.querySelector('h3, h4, [role="heading"], .title').textContent.trim()
            : '';
          
          // Extract other details if available
          const details = {
            title: title,
            text: el.textContent.trim().substring(0, 100) + '...',
            clickable: el.tagName === 'A' || el.querySelector('a') !== null,
            visible: rect.width > 0 && rect.height > 0 && 
                    window.getComputedStyle(el).display !== 'none' &&
                    window.getComputedStyle(el).visibility !== 'hidden',
            position: {
              x: rect.left + rect.width/2,
              y: rect.top + rect.height/2
            },
            index: index + 1 // 1-based index
          };
          
          // Find any links
          const links = el.querySelectorAll('a');
          if (links.length > 0) {
            details.links = Array.from(links).map(link => ({
              href: link.href,
              text: link.textContent.trim()
            }));
          }
          
          return details;
        })
      };
    };
    
    // Try each selector
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements && elements.length > 0) {
        return getElementDetails(elements, selector);
      }
    }
    
    // Last resort - find all cards or items that might be search results
    const allPossibleResults = document.querySelectorAll('div.mdc-card, div.mdc-list-item, [role="listitem"]');
    if (allPossibleResults.length > 0) {
      return getElementDetails(allPossibleResults, 'generic-cards-and-items');
    }
    
    // If still not found, get all major divs with their content for analysis
    const majorDivs = document.querySelectorAll('#site-content > div, #root > div > div');
    return {
      count: 0,
      selector: 'none',
      error: 'No results found with known selectors',
      pageContent: Array.from(majorDivs).map(div => ({
        classes: div.className,
        childCount: div.children.length,
        text: div.textContent.trim().substring(0, 50) + '...'
      }))
    };
  }, possibleSelectors);
  
  return results;
}

/**
 * Function to click on a specific search result by index
 * @param {Object} page - Playwright page object
 * @param {number} resultIndex - 1-based index of the result to click (1 = first result)
 */
async function clickKaggleSearchResult(page, resultIndex) {
  console.log(`Attempting to click search result #${resultIndex}...`);
  
  // First analyze the search results
  const results = await analyzeKaggleSearchResults(page);
  
  if (results.count === 0) {
    console.error('No search results found to click');
    return false;
  }
  
  console.log(`Found ${results.count} search results using selector: ${results.selector}`);
  
  // Adjust index to be 0-based for array access
  const index = resultIndex - 1;
  
  // Check if index is valid
  if (index < 0 || index >= results.count) {
    console.error(`Result index ${resultIndex} is out of bounds (1-${results.count})`);
    return false;
  }
  
  const targetResult = results.items[index];
  
  // Log info about the result we're trying to click
  console.log(`Target: ${targetResult.title || 'Untitled'}`);
  
  // Different approaches to click the result
  
  // Approach 1: Use Playwright to click the element using the selector and index
  try {
    const elementSelector = `${results.selector}:nth-child(${resultIndex})`;
    console.log(`Trying to click with selector: ${elementSelector}`);
    await page.click(elementSelector);
    console.log('Clicked successfully using selector');
    return true;
  } catch (err) {
    console.log(`Selector approach failed: ${err.message}`);
  }
  
  // Approach 2: If there's a link inside, click that directly
  if (targetResult.links && targetResult.links.length > 0) {
    try {
      const linkHref = targetResult.links[0].href;
      console.log(`Trying to click link with href: ${linkHref}`);
      await page.click(`a[href="${linkHref}"]`);
      console.log('Clicked successfully using link href');
      return true;
    } catch (err) {
      console.log(`Link approach failed: ${err.message}`);
    }
  }
  
  // Approach 3: Click by position
  try {
    if (targetResult.visible && targetResult.position) {
      console.log(`Trying to click at position: x=${targetResult.position.x}, y=${targetResult.position.y}`);
      await page.mouse.click(targetResult.position.x, targetResult.position.y);
      console.log('Clicked successfully using position');
      return true;
    }
  } catch (err) {
    console.log(`Position approach failed: ${err.message}`);
  }
  
  // If all approaches fail, try a JavaScript approach
  try {
    const jsClick = await page.evaluate((selector, index) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > index) {
        // Find a clickable element
        const element = elements[index];
        
        // Try to find a link inside
        const link = element.querySelector('a');
        if (link) {
          link.click();
          return { success: true, method: 'link' };
        }
        
        // Otherwise click the element itself
        element.click();
        return { success: true, method: 'element' };
      }
      return { success: false };
    }, results.selector, index);
    
    if (jsClick.success) {
      console.log(`Clicked successfully using JavaScript (${jsClick.method})`);
      return true;
    }
  } catch (err) {
    console.log(`JavaScript approach failed: ${err.message}`);
  }
  
  console.error('All approaches to click the search result failed');
  return false;
}

// Export functions
module.exports = {
  analyzeKaggleSearchResults,
  clickKaggleSearchResult
}; 