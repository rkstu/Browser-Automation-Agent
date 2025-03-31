#!/usr/bin/env node

// CLI script to click on a specific Kaggle search result

const BrowserController = require('./src/BrowserController');
const searchHelper = require('./kaggle_search_helper');

/**
 * Click on a specified search result by number
 */
async function clickSearchResult(resultNumber) {
  // Initialize browser controller
  const browser = new BrowserController();
  
  try {
    console.log('Initializing browser...');
    await browser.initialize();
    
    // Get the current URL
    const currentUrl = browser.currentUrl || '';
    console.log(`Current URL: ${currentUrl}`);
    
    // Make sure we're on Kaggle search page
    if (!currentUrl.includes('kaggle.com/search')) {
      console.log('Not on Kaggle search page, navigating...');
      await browser.navigate('https://kaggle.com/search');
      await browser.wait(2000);
    }
    
    // Take a screenshot for debugging
    await browser.screenshot('test_images/before-click.png');
    console.log('Saved screenshot to test_images/before-click.png');
    
    // Click the search result
    console.log(`Attempting to click on result #${resultNumber}...`);
    const success = await searchHelper.clickKaggleSearchResult(browser.page, resultNumber);
    
    if (success) {
      console.log(`Successfully clicked on result #${resultNumber}`);
      
      // Wait for navigation
      await browser.wait(3000);
      
      // Take screenshot of the result page
      await browser.screenshot('test_images/after-click.png');
      console.log('Saved screenshot to test_images/after-click.png');
      
      // Print the URL we navigated to
      const finalUrl = await browser.page.url();
      console.log(`Navigated to: ${finalUrl}`);
      
      // Extract and display basic content
      const pageTitle = await browser.page.title();
      console.log(`Page title: ${pageTitle}`);
      
      // Let's get some content from the page
      const content = await browser.page.evaluate(() => {
        const mainElement = document.querySelector('#site-content') || document.querySelector('main');
        if (mainElement) {
          return mainElement.innerText.substring(0, 500) + '...';
        }
        return document.body.innerText.substring(0, 500) + '...';
      });
      
      console.log('\nPage preview:');
      console.log('--------------');
      console.log(content);
      console.log('--------------\n');
      
      return true;
    } else {
      console.error(`Failed to click on result #${resultNumber}`);
      return false;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  } finally {
    // Close the browser
    await browser.close();
  }
}

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('\nUsage: node click_result.js <result_number>');
    console.log('\nOptions:');
    console.log('  <result_number>    Number of the search result to click (1 for first result)');
    console.log('  --help, -h         Show this help message\n');
    process.exit(0);
  }
  
  const resultNumber = parseInt(args[0], 10);
  
  if (isNaN(resultNumber) || resultNumber < 1) {
    console.error('Error: Please provide a valid positive number for the search result.');
    process.exit(1);
  }
  
  return resultNumber;
}

// Main execution
if (require.main === module) {
  const resultNumber = parseArgs();
  
  clickSearchResult(resultNumber)
    .then(success => {
      console.log(success ? 'Operation completed successfully' : 'Operation failed');
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Unhandled error:', err);
      process.exit(1);
    });
} 