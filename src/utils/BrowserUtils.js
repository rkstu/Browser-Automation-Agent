/**
 * Utility functions for more human-like browser interactions
 */

/**
 * Wait for a random amount of time to simulate human behavior
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
 async function randomDelay(min = 1000, max = 5000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get a random user agent from the pool
 * @returns {string} - A random user agent string
 */
function getRandomUserAgent() {
  const userAgents = [
    // Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    
    // Firefox on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0',
    
    // Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
    
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    
    // Edge on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    
    // Firefox on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Check if a CAPTCHA is present on the page
 * @param {import('playwright').Page} page - Playwright page object
 * @returns {Promise<boolean>} - Whether a CAPTCHA is present
 */
async function isCaptchaPresent(page) {
  try {
    // Check for common CAPTCHA elements
    const captchaElements = [
      // reCAPTCHA elements
      'iframe[src*="recaptcha"]',
      'iframe[src*="captcha"]',
      'div.g-recaptcha',
      '#recaptcha',
      // hCaptcha elements
      'iframe[src*="hcaptcha"]',
      '.h-captcha',
      '#hcaptcha',
    ];
    
    // Check for visual indicators (not text that simply mentions CAPTCHA)
    const hasCaptchaElement = await page.evaluate((selectors) => {
      for (const selector of selectors) {
        if (document.querySelector(selector)) {
          return true;
        }
      }
      return false;
    }, captchaElements);
    
    if (hasCaptchaElement) {
      console.log('CAPTCHA element detected on page');
      return true;
    }
    
    // Don't check for text that mentions CAPTCHA as it causes false positives
    // on pages that just have CAPTCHA mentioned in their content
    
    return false;
  } catch (error) {
    console.warn('Error checking for CAPTCHA:', error.message);
    return false;
  }
}

/**
 * Generate a realistic human-like path for mouse movement
 * @param {Object} start - Starting coordinates {x, y}
 * @param {Object} end - Ending coordinates {x, y}
 * @param {number} numPoints - Number of points in the path
 * @returns {Array<{x: number, y: number}>} - Array of points for the path
 */
function generateHumanMousePath(start, end, numPoints = 10) {
  const points = [];
  points.push(start);
  
  // Control points for the Bezier curve (simulate human curve)
  const cp1 = {
    x: start.x + (end.x - start.x) / 3 + (Math.random() * 20 - 10),
    y: start.y + (end.y - start.y) / 3 + (Math.random() * 20 - 10)
  };
  
  const cp2 = {
    x: start.x + 2 * (end.x - start.x) / 3 + (Math.random() * 20 - 10),
    y: start.y + 2 * (end.y - start.y) / 3 + (Math.random() * 20 - 10)
  };
  
  // Generate points along a Bezier curve for natural movement
  for (let i = 1; i < numPoints; i++) {
    const t = i / numPoints;
    const point = {
      x: Math.pow(1 - t, 3) * start.x + 3 * Math.pow(1 - t, 2) * t * cp1.x + 3 * (1 - t) * Math.pow(t, 2) * cp2.x + Math.pow(t, 3) * end.x,
      y: Math.pow(1 - t, 3) * start.y + 3 * Math.pow(1 - t, 2) * t * cp1.y + 3 * (1 - t) * Math.pow(t, 2) * cp2.y + Math.pow(t, 3) * end.y
    };
    points.push(point);
  }
  
  points.push(end);
  return points;
}

/**
 * Generates warm-up navigation targets for more natural browsing patterns
 * @returns {Array<string>} - List of URLs to visit as part of warm-up
 */
function getWarmupTargets() {
  const sites = [
    'https://www.weather.com',
    'https://www.wikipedia.org',
    'https://www.github.com',
    'https://www.nytimes.com',
    'https://www.reddit.com',
    'https://www.cnn.com',
    'https://www.theguardian.com',
    'https://www.bbc.com',
    'https://www.imdb.com',
  ];
  
  // Pick 1-3 random sites for warm-up
  const count = Math.floor(Math.random() * 3) + 1;
  const shuffled = [...sites].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

module.exports = {
  randomDelay,
  isCaptchaPresent,
  generateHumanMousePath,
  getRandomUserAgent,
  getWarmupTargets
}; 