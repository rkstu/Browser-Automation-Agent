#!/usr/bin/env node

// Script to analyze Kaggle search results and display them

const BrowserController = require('./src/BrowserController');
const searchHelper = require('./kaggle_search_helper');
const fs = require('fs');
const path = require('path');

/**
 * Analyze and list Kaggle search results
 */
async function analyzeSearchResults() {
  // Initialize the browser controller
  const browser = new BrowserController();
  
  try {
    console.log('Initializing browser...');
    await browser.initialize();
    
    // Check if we're on Kaggle search page
    const currentUrl = browser.currentUrl || '';
    console.log(`Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('kaggle.com/search')) {
      console.log('Not currently on Kaggle search page, navigating...');
      await browser.navigate('https://kaggle.com/search');
      await browser.wait(2000);
    }
    
    // Take screenshot for reference
    console.log('Taking screenshot of search page...');
    await browser.screenshot('test_images/search-page.png');
    
    // Analyze search results
    console.log('Analyzing search results...');
    const results = await searchHelper.analyzeKaggleSearchResults(browser.page);
    
    if (results.count > 0) {
      console.log(`Found ${results.count} search results using selector: ${results.selector}`);
      
      // Print results info
      console.log('\n===== SEARCH RESULTS =====\n');
      
      results.items.forEach((item, i) => {
        console.log(`[${i+1}] ${item.title || 'Untitled'}`);
        console.log(`    Content: ${item.text.substring(0, 100).replace(/\n/g, ' ')}...`);
        console.log(`    Visible: ${item.visible ? 'Yes' : 'No'}`);
        console.log(`    Clickable: ${item.clickable ? 'Yes' : 'No'}`);
        
        if (item.links && item.links.length > 0) {
          console.log(`    Links: ${item.links.length}`);
          item.links.forEach(link => {
            console.log(`      - ${link.text || 'No text'}: ${link.href || 'No URL'}`);
          });
        }
        
        console.log('-------------------');
      });
      
      // Save results to a JSON file for reference
      const resultsDir = path.join(__dirname, 'test_images');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const fileName = path.join(resultsDir, 'search-results.json');
      fs.writeFileSync(fileName, JSON.stringify(results, null, 2));
      console.log(`\nDetailed results saved to ${fileName}`);
      
      // Print instructions for using the click_result.js script
      console.log('\nTo click on a specific result, run:');
      console.log('  node click_result.js [result_number]');
      console.log('\nExample:');
      console.log('  node click_result.js 1    # Click on the first result');
      console.log('  node click_result.js 2    # Click on the second result\n');
      
      return results;
    } else {
      console.log('No search results found on the page.');
      
      // If no results found, print page structure information
      console.log('\nPage structure information:');
      if (results.pageContent) {
        results.pageContent.forEach((div, i) => {
          console.log(`Element ${i}:`);
          console.log(`  Classes: ${div.classes}`);
          console.log(`  Child elements: ${div.childCount}`);
          console.log(`  Text: ${div.text}`);
          console.log('-------------------');
        });
      }
      
      // Suggest performing a search
      console.log('\nNo search results found. Try performing a search first:');
      console.log('  1. In the CLI: "search [your search term]"');
      console.log('  2. In code: await browser.searchKaggle("[your search term]")');
      
      return null;
    }
  } catch (error) {
    console.error('Error analyzing search results:', error);
    return null;
  } finally {
    // Close the browser
    console.log('Closing browser...');
    await browser.close();
  }
}

// If this script is run directly, execute the main function
if (require.main === module) {
  analyzeSearchResults()
    .then(() => {
      console.log('Analysis completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Analysis failed:', err);
      process.exit(1);
    });
}

module.exports = { analyzeSearchResults }; 