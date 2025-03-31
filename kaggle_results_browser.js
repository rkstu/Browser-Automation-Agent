// Kaggle Results Browser Script
// This script integrates our search result helper with the existing BrowserController

const BrowserController = require('./src/BrowserController');
const searchHelper = require('./kaggle_search_helper');

/**
 * Main function to analyze and interact with Kaggle search results
 */
async function browseKaggleSearchResults() {
  // Initialize the browser controller
  const browser = new BrowserController();
  
  try {
    console.log('Initializing browser...');
    await browser.initialize();
    
    // Check if we're on Kaggle search page, if not navigate there
    let currentUrl = browser.currentUrl || '';
    if (!currentUrl.includes('kaggle.com/search')) {
      console.log('Navigating to Kaggle search page...');
      await browser.navigate('https://kaggle.com/search');
      await browser.wait(2000);
    }
    
    // Analyze search results structure
    console.log('Analyzing search results structure...');
    const results = await searchHelper.analyzeKaggleSearchResults(browser.page);
    
    if (results.count > 0) {
      console.log(`Found ${results.count} search results using selector: ${results.selector}`);
      console.log('Search results found:');
      
      // Display the results
      results.items.forEach((item, i) => {
        console.log(`[${i+1}] ${item.title || 'Untitled'}`);
        console.log(`    ${item.text.substring(0, 70)}...`);
        console.log(`    Clickable: ${item.clickable ? 'Yes' : 'No'}`);
        if (item.links && item.links.length > 0) {
          console.log(`    Link: ${item.links[0].href}`);
        }
        console.log('-------------------');
      });
      
      // Prompt for which result to click
      console.log('\nWhich result would you like to view? (Enter a number 1-' + results.count + ')');
      
      // In a real CLI environment, you'd wait for user input here
      // For this script, let's assume we want the first result
      const resultToClick = 1;
      
      // Click the selected result
      console.log(`Clicking result ${resultToClick}...`);
      const clickResult = await searchHelper.clickKaggleSearchResult(browser.page, resultToClick);
      
      if (clickResult) {
        console.log('Successfully clicked search result');
        
        // Wait for navigation and page load
        await browser.wait(3000);
        
        // Take screenshot of the resulting page
        await browser.screenshot('test_images/kaggle-result-page.png');
        console.log('Saved screenshot of the resulting page to test_images/kaggle-result-page.png');
        
        // Extract content from the page
        const pageContent = await browser.page.evaluate(() => {
          // Find main content area
          const mainContent = document.querySelector('#site-content') || document.querySelector('main');
          
          if (mainContent) {
            // Get headings and text paragraphs
            const headings = Array.from(mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6'))
              .map(h => ({
                level: parseInt(h.tagName.substring(1)),
                text: h.textContent.trim()
              }));
              
            const paragraphs = Array.from(mainContent.querySelectorAll('p'))
              .map(p => p.textContent.trim())
              .filter(text => text.length > 0);
            
            // Get dataset metadata if available
            const metadata = {};
            const metadataElements = mainContent.querySelectorAll('[data-testid="metadata-field"]');
            if (metadataElements.length > 0) {
              Array.from(metadataElements).forEach(el => {
                const label = el.querySelector('.sc-dGxEkI')?.textContent.trim();
                const value = el.querySelector('.sc-fIavCj')?.textContent.trim();
                if (label && value) {
                  metadata[label] = value;
                }
              });
            }
            
            return {
              title: document.title,
              url: window.location.href,
              headings,
              paragraphs,
              metadata,
              fullText: mainContent.textContent.trim()
            };
          }
          
          return {
            title: document.title,
            url: window.location.href,
            fullText: document.body.textContent.trim().substring(0, 5000)
          };
        });
        
        // Display the content
        console.log('\n----- RESULT PAGE CONTENT -----');
        console.log(`Title: ${pageContent.title}`);
        console.log(`URL: ${pageContent.url}\n`);
        
        if (pageContent.headings) {
          console.log('--- Headings ---');
          pageContent.headings.forEach(h => {
            console.log(`${'#'.repeat(h.level)} ${h.text}`);
          });
          console.log('');
        }
        
        if (pageContent.metadata && Object.keys(pageContent.metadata).length > 0) {
          console.log('--- Metadata ---');
          for (const [key, value] of Object.entries(pageContent.metadata)) {
            console.log(`${key}: ${value}`);
          }
          console.log('');
        }
        
        if (pageContent.paragraphs && pageContent.paragraphs.length > 0) {
          console.log('--- Content Preview ---');
          pageContent.paragraphs.slice(0, 3).forEach(p => {
            console.log(p);
            console.log('');
          });
        } else {
          console.log('--- Content Preview ---');
          console.log(pageContent.fullText.substring(0, 1000) + '...');
        }
        
        console.log('\n----- END OF CONTENT -----');
      } else {
        console.error('Failed to click search result');
      }
    } else {
      console.log('No search results found on the page.');
      console.log('Page structure information:');
      console.log(JSON.stringify(results.pageContent, null, 2));
    }
  } catch (error) {
    console.error('Error during Kaggle search result browsing:', error);
  } finally {
    // Close the browser
    console.log('Closing browser...');
    await browser.close();
  }
}

// If this script is run directly, execute the main function
if (require.main === module) {
  browseKaggleSearchResults()
    .then(() => console.log('Script completed'))
    .catch(err => console.error('Script failed:', err));
}

module.exports = { browseKaggleSearchResults }; 