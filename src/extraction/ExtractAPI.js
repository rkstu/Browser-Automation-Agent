/**
 * ExtractAPI provides powerful data extraction capabilities for structured web content
 */

const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('../utils/fileUtils');

class ExtractAPI {
  constructor(browserController) {
    this.browserController = browserController;
    this.lastExtractedData = null;
  }
  
  /**
   * Extract structured data from the current page
   * @param {Object} options - Extraction options
   * @param {string} options.type - Type of extraction ('table', 'list', 'form', 'custom')
   * @param {string} options.selector - CSS selector for the target element(s)
   * @param {Object} options.config - Additional extraction configuration
   * @returns {Promise<Object>} - Extracted data
   */
  async extractData(options = {}) {
    if (!this.browserController || !this.browserController.page) {
      throw new Error('Browser controller not initialized');
    }
    
    console.log(`Extracting ${options.type} data from page...`);
    
    // Default options
    const extractionOptions = {
      type: 'table',
      selector: 'table',
      config: {},
      ...options
    };
    
    // Select the appropriate extraction strategy
    switch (extractionOptions.type.toLowerCase()) {
      case 'table':
        return await this.extractTable(extractionOptions);
      
      case 'list':
        return await this.extractList(extractionOptions);
      
      case 'form':
        return await this.extractForm(extractionOptions);
      
      case 'feed':
        return await this.extractFeed(extractionOptions);
      
      case 'products':
        return await this.extractProducts(extractionOptions);
      
      case 'search':
        return await this.extractSearchResults(extractionOptions);
        
      case 'structured':
        return await this.extractStructuredData(extractionOptions);
      
      case 'custom':
        return await this.extractCustom(extractionOptions);
      
      default:
        throw new Error(`Unknown extraction type: ${extractionOptions.type}`);
    }
  }
  
  /**
   * Extract table data
   */
  async extractTable({ selector, config = {} }) {
    console.log(`Extracting table data with selector: ${selector}`);
    
    try {
      // Extract table data using browser's evaluate
      const tableData = await this.browserController.evaluate((selector, config) => {
        // Find all tables matching the selector
        const tables = document.querySelectorAll(selector);
        if (!tables || tables.length === 0) {
          return { error: 'No tables found matching the selector' };
        }
        
        // Process each table
        const extractedTables = Array.from(tables).map((table, tableIndex) => {
          // Extract headers
          const headerRows = table.querySelectorAll('thead tr');
          let headers = [];
          
          if (headerRows.length > 0) {
            // Use thead for headers if available
            const headerCells = headerRows[0].querySelectorAll('th, td');
            headers = Array.from(headerCells).map(cell => cell.innerText.trim());
          } else {
            // Otherwise use the first row as headers
            const firstRow = table.querySelector('tr');
            if (firstRow) {
              const headerCells = firstRow.querySelectorAll('th, td');
              headers = Array.from(headerCells).map(cell => cell.innerText.trim());
            }
          }
          
          // Extract rows (skip header row if we used it for headers)
          const skipFirstRow = headerRows.length === 0 && headers.length > 0;
          const rowElements = Array.from(table.querySelectorAll('tbody tr, tr'));
          
          if (skipFirstRow && rowElements.length > 0) {
            rowElements.shift(); // Remove first row if it's the header
          }
          
          // Process each row
          const rows = rowElements.map(row => {
            const cells = row.querySelectorAll('td, th');
            return Array.from(cells).map(cell => cell.innerText.trim());
          });
          
          return {
            headers,
            rows,
            rowCount: rows.length,
            columnCount: headers.length
          };
        });
        
        // Return single table or array of tables
        return {
          tables: extractedTables,
          count: extractedTables.length
        };
      }, selector, config);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'table',
        timestamp: new Date().toISOString(),
        data: tableData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting table data:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract list data
   */
  async extractList({ selector, config = {} }) {
    console.log(`Extracting list data with selector: ${selector}`);
    
    try {
      // Extract list data using browser's evaluate
      const listData = await this.browserController.evaluate((selector, config) => {
        // Find all lists matching the selector
        const lists = document.querySelectorAll(selector);
        if (!lists || lists.length === 0) {
          return { error: 'No lists found matching the selector' };
        }
        
        // Process each list
        const extractedLists = Array.from(lists).map((list, listIndex) => {
          // Determine list type
          const tagName = list.tagName.toLowerCase();
          const listType = tagName === 'ol' ? 'ordered' : 'unordered';
          
          // Extract items
          const itemElements = list.querySelectorAll('li');
          const items = Array.from(itemElements).map(item => {
            // Check for nested structure
            const nestedLists = item.querySelectorAll('ul, ol');
            const hasNested = nestedLists.length > 0;
            
            // If there are nested lists, extract them recursively
            let nestedItems = [];
            if (hasNested) {
              nestedItems = Array.from(nestedLists).map(nestedList => {
                const nestedType = nestedList.tagName.toLowerCase() === 'ol' ? 'ordered' : 'unordered';
                const nestedElements = nestedList.querySelectorAll('li');
                const nestedContent = Array.from(nestedElements).map(nestedItem => nestedItem.innerText.trim());
                
                return {
                  type: nestedType,
                  items: nestedContent
                };
              });
            }
            
            // Get the main text content (excluding nested list text)
            const mainText = Array.from(item.childNodes)
              .filter(node => node.nodeType === 3 || (node.nodeType === 1 && node.tagName.toLowerCase() !== 'ul' && node.tagName.toLowerCase() !== 'ol'))
              .map(node => node.textContent || node.innerText || '')
              .join('').trim();
            
            return {
              text: mainText,
              hasNestedList: hasNested,
              nestedLists: nestedItems
            };
          });
          
          return {
            type: listType,
            items,
            itemCount: items.length
          };
        });
        
        // Return single list or array of lists
        return {
          lists: extractedLists,
          count: extractedLists.length
        };
      }, selector, config);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'list',
        timestamp: new Date().toISOString(),
        data: listData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting list data:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract form data
   */
  async extractForm({ selector, config = {} }) {
    console.log(`Extracting form data with selector: ${selector}`);
    
    try {
      // Extract form data using browser's evaluate
      const formData = await this.browserController.evaluate((selector, config) => {
        // Find all forms matching the selector
        const forms = document.querySelectorAll(selector);
        if (!forms || forms.length === 0) {
          return { error: 'No forms found matching the selector' };
        }
        
        // Process each form
        const extractedForms = Array.from(forms).map((form, formIndex) => {
          // Extract basic form attributes
          const formInfo = {
            id: form.id || '',
            name: form.name || '',
            action: form.action || '',
            method: form.method || 'GET',
            enctype: form.enctype || ''
          };
          
          // Extract input fields
          const inputElements = form.querySelectorAll('input, select, textarea, button[type="submit"]');
          const fields = Array.from(inputElements).map(input => {
            // Get field label if available
            let label = '';
            if (input.id) {
              const labelElement = document.querySelector(`label[for="${input.id}"]`);
              if (labelElement) {
                label = labelElement.innerText.trim();
              }
            }
            
            // Handle different input types
            const fieldType = input.type || input.tagName.toLowerCase();
            
            // Don't include passwords or hidden fields with sensitive info
            const isSensitive = fieldType === 'password' || 
                              (fieldType === 'hidden' && input.name && 
                               (input.name.toLowerCase().includes('token') || 
                                input.name.toLowerCase().includes('auth') || 
                                input.name.toLowerCase().includes('key')));
            
            if (isSensitive) {
              return {
                type: fieldType,
                name: input.name || '',
                id: input.id || '',
                label,
                value: '[SENSITIVE]',
                isSensitive: true
              };
            }
            
            let fieldValue = input.value || '';
            let options = [];
            
            // For select elements, get all options
            if (input.tagName.toLowerCase() === 'select') {
              options = Array.from(input.querySelectorAll('option')).map(option => ({
                value: option.value,
                text: option.innerText.trim(),
                selected: option.selected
              }));
              
              if (input.multiple) {
                fieldValue = Array.from(input.selectedOptions).map(option => option.value);
              } else {
                fieldValue = input.value;
              }
            }
            
            // For radio and checkbox, check if it's selected
            if (fieldType === 'radio' || fieldType === 'checkbox') {
              fieldValue = input.checked;
            }
            
            return {
              type: fieldType,
              name: input.name || '',
              id: input.id || '',
              label,
              placeholder: input.placeholder || '',
              value: fieldValue,
              options: options.length > 0 ? options : undefined,
              required: input.required || false,
              disabled: input.disabled || false
            };
          });
          
          return {
            ...formInfo,
            fields,
            fieldCount: fields.length
          };
        });
        
        // Return single form or array of forms
        return {
          forms: extractedForms,
          count: extractedForms.length
        };
      }, selector, config);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'form',
        timestamp: new Date().toISOString(),
        data: formData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting form data:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract feed data (articles, blog posts, news items)
   */
  async extractFeed({ selector, config = {} }) {
    console.log(`Extracting feed data with selector: ${selector}`);
    
    try {
      // Extract feed data using browser's evaluate
      const feedData = await this.browserController.evaluate((selector, config) => {
        // Find all feed items matching the selector
        const feedItems = document.querySelectorAll(selector);
        if (!feedItems || feedItems.length === 0) {
          return { error: 'No feed items found matching the selector' };
        }
        
        // Process each feed item
        const extractedItems = Array.from(feedItems).map((item, index) => {
          // Common feed item selectors
          const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.title', '[class*="title"]', '[class*="heading"]'];
          const descriptionSelectors = ['p', '.description', '.summary', '[class*="description"]', '[class*="summary"]'];
          const dateSelectors = ['.date', '.time', '.timestamp', '[class*="date"]', '[class*="time"]', 'time'];
          const authorSelectors = ['.author', '.byline', '[class*="author"]', '[class*="byline"]'];
          const imageSelectors = ['img', '.image', '[class*="image"]'];
          
          // Extract title
          let title = '';
          for (const selector of titleSelectors) {
            const titleElement = item.querySelector(selector);
            if (titleElement) {
              title = titleElement.innerText.trim();
              break;
            }
          }
          
          // Extract description
          let description = '';
          for (const selector of descriptionSelectors) {
            const descElement = item.querySelector(selector);
            if (descElement) {
              description = descElement.innerText.trim();
              break;
            }
          }
          
          // Extract date
          let date = '';
          for (const selector of dateSelectors) {
            const dateElement = item.querySelector(selector);
            if (dateElement) {
              date = dateElement.innerText.trim() || dateElement.getAttribute('datetime') || '';
              break;
            }
          }
          
          // Extract author
          let author = '';
          for (const selector of authorSelectors) {
            const authorElement = item.querySelector(selector);
            if (authorElement) {
              author = authorElement.innerText.trim();
              break;
            }
          }
          
          // Extract image
          let image = '';
          for (const selector of imageSelectors) {
            const imageElement = item.querySelector(selector);
            if (imageElement && imageElement.src) {
              image = imageElement.src;
              break;
            }
          }
          
          // Extract link
          const linkElement = item.querySelector('a') || item.closest('a');
          const link = linkElement ? linkElement.href : '';
          
          return {
            index: index + 1,
            title: title || `Item ${index + 1}`,
            description,
            date,
            author,
            image,
            link,
            html: item.innerHTML
          };
        });
        
        return {
          items: extractedItems,
          count: extractedItems.length
        };
      }, selector, config);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'feed',
        timestamp: new Date().toISOString(),
        data: feedData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting feed data:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract product data from e-commerce pages
   */
  async extractProducts({ selector, config = {} }) {
    console.log(`Extracting product data with selector: ${selector}`);
    
    try {
      // Extract product data using browser's evaluate
      const productData = await this.browserController.evaluate((selector, config) => {
        // Find all product items matching the selector
        const productItems = document.querySelectorAll(selector);
        if (!productItems || productItems.length === 0) {
          return { error: 'No product items found matching the selector' };
        }
        
        // Process each product item
        const extractedProducts = Array.from(productItems).map((item, index) => {
          // Common product item selectors
          const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.title', '.product-title', '[class*="title"]', '[class*="name"]'];
          const priceSelectors = ['.price', '[class*="price"]', '[itemprop="price"]'];
          const ratingSelectors = ['.rating', '[class*="rating"]', '[class*="stars"]'];
          const descriptionSelectors = ['.description', '.summary', '[class*="description"]', '[itemprop="description"]'];
          const imageSelectors = ['img', '.image', '[class*="image"]', '[itemprop="image"]'];
          
          // Extract title
          let title = '';
          for (const selector of titleSelectors) {
            const titleElement = item.querySelector(selector);
            if (titleElement) {
              title = titleElement.innerText.trim();
              break;
            }
          }
          
          // Extract price
          let price = '';
          for (const selector of priceSelectors) {
            const priceElement = item.querySelector(selector);
            if (priceElement) {
              price = priceElement.innerText.trim();
              break;
            }
          }
          
          // Extract rating
          let rating = '';
          for (const selector of ratingSelectors) {
            const ratingElement = item.querySelector(selector);
            if (ratingElement) {
              rating = ratingElement.innerText.trim() || ratingElement.getAttribute('data-rating') || '';
              break;
            }
          }
          
          // Extract description
          let description = '';
          for (const selector of descriptionSelectors) {
            const descElement = item.querySelector(selector);
            if (descElement) {
              description = descElement.innerText.trim();
              break;
            }
          }
          
          // Extract image
          let image = '';
          for (const selector of imageSelectors) {
            const imageElement = item.querySelector(selector);
            if (imageElement && imageElement.src) {
              image = imageElement.src;
              break;
            }
          }
          
          // Extract link
          const linkElement = item.querySelector('a') || item.closest('a');
          const link = linkElement ? linkElement.href : '';
          
          // Extract any additional attributes
          let attributes = {};
          const attributeElements = item.querySelectorAll('[class*="attribute"], [class*="spec"], [class*="detail"]');
          attributeElements.forEach(attrEl => {
            const key = attrEl.querySelector('.label, .name')?.innerText.trim() || '';
            const value = attrEl.querySelector('.value')?.innerText.trim() || '';
            
            if (key && value) {
              attributes[key] = value;
            }
          });
          
          return {
            index: index + 1,
            title: title || `Product ${index + 1}`,
            price,
            rating,
            description,
            image,
            link,
            attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
            html: item.innerHTML
          };
        });
        
        return {
          products: extractedProducts,
          count: extractedProducts.length
        };
      }, selector, config);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'products',
        timestamp: new Date().toISOString(),
        data: productData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting product data:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract search results data
   */
  async extractSearchResults({ selector, config = {} }) {
    console.log(`Extracting search results with selector: ${selector}`);
    
    try {
      // If no selector provided, use default search result extraction
      if (!selector || selector === 'auto') {
        return await this.browserController.extractFormattedSearchResults();
      }
      
      // Otherwise, use the provided selector
      const searchData = await this.browserController.evaluate((selector, config) => {
        // Try to find the search input to get the current query
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"], input[aria-label*="Search"]');
        const searchQuery = searchInput ? searchInput.value : '';
        
        // Find search result items
        const resultItems = document.querySelectorAll(selector);
        if (!resultItems || resultItems.length === 0) {
          return { 
            error: 'No search results found matching the selector',
            query: searchQuery
          };
        }
        
        // Process each search result
        const extractedResults = Array.from(resultItems).map((item, index) => {
          // Common selectors for search results
          const titleSelectors = ['h3', 'h2', 'h4', '.title', '[role="heading"]', 'a'];
          const descriptionSelectors = ['p', '.description', '.snippet', '.summary'];
          
          // Extract title
          let title = '';
          for (const selector of titleSelectors) {
            const titleElement = item.querySelector(selector);
            if (titleElement) {
              title = titleElement.innerText.trim();
              break;
            }
          }
          
          // Extract description/content
          let description = '';
          for (const selector of descriptionSelectors) {
            const descElement = item.querySelector(selector);
            if (descElement) {
              description = descElement.innerText.trim();
              break;
            }
          }
          
          // Extract link
          const linkElement = item.querySelector('a') || item.closest('a');
          const link = linkElement ? linkElement.href : '';
          
          return {
            index: index + 1,
            title: title || `Result ${index + 1}`,
            description,
            link,
            html: item.innerHTML
          };
        });
        
        return {
          query: searchQuery,
          results: extractedResults,
          count: extractedResults.length
        };
      }, selector, config);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'search_results',
        timestamp: new Date().toISOString(),
        data: searchData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting search results:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract structured data (schema.org, microdata, etc.) from the page
   */
  async extractStructuredData({ config = {} }) {
    console.log('Extracting structured data from page...');
    
    try {
      // Extract structured data using browser's evaluate
      const structuredData = await this.browserController.evaluate(() => {
        const results = {
          jsonLd: [],
          microdata: [],
          rdfa: [],
          meta: {}
        };
        
        // Extract JSON-LD
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        if (jsonLdScripts.length > 0) {
          for (const script of jsonLdScripts) {
            try {
              const data = JSON.parse(script.textContent);
              results.jsonLd.push(data);
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
        
        // Extract meta tags
        const metaTags = document.querySelectorAll('meta[property], meta[name]');
        if (metaTags.length > 0) {
          for (const tag of metaTags) {
            const property = tag.getAttribute('property') || tag.getAttribute('name');
            const content = tag.getAttribute('content');
            
            if (property && content) {
              // Group by prefix (og:, twitter:, etc.)
              const prefix = property.split(':')[0];
              if (prefix && prefix !== property) {
                if (!results.meta[prefix]) {
                  results.meta[prefix] = {};
                }
                results.meta[prefix][property.substring(prefix.length + 1)] = content;
              } else {
                results.meta[property] = content;
              }
            }
          }
        }
        
        // Get page metadata
        results.pageInfo = {
          title: document.title,
          url: window.location.href,
          canonical: document.querySelector('link[rel="canonical"]')?.href || null
        };
        
        return results;
      });
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'structured_data',
        timestamp: new Date().toISOString(),
        data: structuredData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error extracting structured data:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Extract custom data using a provided extraction function
   */
  async extractCustom({ selector, config = {} }) {
    console.log('Extracting custom data with provided config...');
    
    try {
      // Check if extraction function is provided
      if (!config.extractionFunction) {
        throw new Error('No extraction function provided for custom extraction');
      }
      
      // Ensure the function is a string that can be evaluated
      if (typeof config.extractionFunction !== 'string') {
        config.extractionFunction = config.extractionFunction.toString();
      }
      
      // Execute the custom extraction function
      const customData = await this.browserController.evaluate((selector, extractionFunction) => {
        // Convert string function to executable function
        const extractFn = new Function('selector', 'document', 'return ' + extractionFunction)(selector, document);
        
        // Execute the extraction function
        return extractFn(selector, document);
      }, selector, config.extractionFunction);
      
      // Format and store the extracted data
      this.lastExtractedData = {
        type: 'custom',
        timestamp: new Date().toISOString(),
        data: customData,
        sourceUrl: await this.browserController.getCurrentUrl()
      };
      
      return this.lastExtractedData;
    } catch (error) {
      console.error('Error executing custom extraction:', error.message);
      return { error: error.message };
    }
  }
  
  /**
   * Export the last extracted data to a file
   * @param {Object} options - Export options
   * @param {string} options.format - Export format ('json', 'csv', 'html')
   * @param {string} options.filename - Filename to save (without extension)
   * @returns {Promise<string>} - Path to the exported file
   */
  async exportData(options = {}) {
    if (!this.lastExtractedData) {
      throw new Error('No data has been extracted yet');
    }
    
    // Default options
    const exportOptions = {
      format: 'json',
      filename: `extracted-data-${new Date().getTime()}`,
      ...options
    };
    
    // Ensure directory exists
    const outputDir = path.resolve('./exports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Sanitize filename
    const safeFilename = sanitizeFilename(exportOptions.filename);
    
    // Format by export type
    let outputPath;
    
    switch (exportOptions.format.toLowerCase()) {
      case 'json':
        outputPath = path.join(outputDir, `${safeFilename}.json`);
        await fs.promises.writeFile(
          outputPath,
          JSON.stringify(this.lastExtractedData, null, 2)
        );
        break;
        
      case 'csv':
        outputPath = path.join(outputDir, `${safeFilename}.csv`);
        await this._exportToCsv(outputPath, this.lastExtractedData);
        break;
        
      case 'html':
        outputPath = path.join(outputDir, `${safeFilename}.html`);
        await this._exportToHtml(outputPath, this.lastExtractedData);
        break;
        
      default:
        throw new Error(`Unsupported export format: ${exportOptions.format}`);
    }
    
    console.log(`Data exported to: ${outputPath}`);
    return outputPath;
  }
  
  /**
   * Export data to CSV format
   * @private
   */
  async _exportToCsv(filePath, data) {
    // Only certain data types can be exported to CSV
    const csvCompatibleTypes = ['table', 'list', 'products', 'search_results', 'feed'];
    
    if (!csvCompatibleTypes.includes(data.type)) {
      throw new Error(`Data type '${data.type}' cannot be exported to CSV`);
    }
    
    let csvContent = '';
    
    // Format based on data type
    switch (data.type) {
      case 'table':
        // For tables, use the first table
        if (data.data.tables && data.data.tables.length > 0) {
          const table = data.data.tables[0];
          
          // Add headers
          if (table.headers && table.headers.length > 0) {
            csvContent += table.headers.map(header => `"${header.replace(/"/g, '""')}"`).join(',') + '\n';
          }
          
          // Add rows
          if (table.rows && table.rows.length > 0) {
            table.rows.forEach(row => {
              csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
            });
          }
        }
        break;
        
      case 'list':
        // For lists, add a single header and item text
        csvContent += '"Item"\n';
        
        if (data.data.lists && data.data.lists.length > 0) {
          data.data.lists.forEach(list => {
            list.items.forEach(item => {
              csvContent += `"${typeof item === 'string' ? item.replace(/"/g, '""') : item.text.replace(/"/g, '""')}"\n`;
            });
          });
        }
        break;
        
      case 'products':
        // For products, create columns for common product attributes
        if (data.data.products && data.data.products.length > 0) {
          // Create headers
          csvContent += '"Title","Price","Rating","Description","Link","Image"\n';
          
          // Add product rows
          data.data.products.forEach(product => {
            csvContent += [
              `"${(product.title || '').replace(/"/g, '""')}"`,
              `"${(product.price || '').replace(/"/g, '""')}"`,
              `"${(product.rating || '').replace(/"/g, '""')}"`,
              `"${(product.description || '').replace(/"/g, '""')}"`,
              `"${(product.link || '').replace(/"/g, '""')}"`,
              `"${(product.image || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
          });
        }
        break;
        
      case 'search_results':
      case 'feed':
        // For search results and feeds, use common attributes
        if (data.data.results || data.data.items) {
          const items = data.data.results || data.data.items;
          
          // Create headers
          csvContent += '"Title","Description","Link"\n';
          
          // Add item rows
          items.forEach(item => {
            csvContent += [
              `"${(item.title || '').replace(/"/g, '""')}"`,
              `"${(item.description || '').replace(/"/g, '""')}"`,
              `"${(item.link || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
          });
        }
        break;
    }
    
    // Write to file
    await fs.promises.writeFile(filePath, csvContent);
  }
  
  /**
   * Export data to HTML format
   * @private
   */
  async _exportToHtml(filePath, data) {
    // Create basic HTML structure
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Extracted Data - ${data.type}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          h1, h2 { color: #333; }
          .metadata { color: #666; font-size: 0.9em; margin-bottom: 20px; }
          .container { max-width: 1200px; margin: 0 auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Extracted ${data.type} Data</h1>
          <div class="metadata">
            <p>Source URL: <a href="${data.sourceUrl}">${data.sourceUrl}</a></p>
            <p>Timestamp: ${data.timestamp}</p>
          </div>
    `;
    
    // Format based on data type
    switch (data.type) {
      case 'table':
        if (data.data.tables && data.data.tables.length > 0) {
          data.data.tables.forEach((table, index) => {
            htmlContent += `<h2>Table ${index + 1}</h2>`;
            htmlContent += '<table>';
            
            // Add headers
            if (table.headers && table.headers.length > 0) {
              htmlContent += '<thead><tr>';
              table.headers.forEach(header => {
                htmlContent += `<th>${header}</th>`;
              });
              htmlContent += '</tr></thead>';
            }
            
            // Add rows
            if (table.rows && table.rows.length > 0) {
              htmlContent += '<tbody>';
              table.rows.forEach(row => {
                htmlContent += '<tr>';
                row.forEach(cell => {
                  htmlContent += `<td>${cell}</td>`;
                });
                htmlContent += '</tr>';
              });
              htmlContent += '</tbody>';
            }
            
            htmlContent += '</table>';
          });
        }
        break;
        
      case 'list':
        if (data.data.lists && data.data.lists.length > 0) {
          data.data.lists.forEach((list, index) => {
            htmlContent += `<h2>List ${index + 1}</h2>`;
            
            if (list.type === 'ordered') {
              htmlContent += '<ol>';
            } else {
              htmlContent += '<ul>';
            }
            
            list.items.forEach(item => {
              const itemText = typeof item === 'string' ? item : item.text;
              htmlContent += `<li>${itemText}</li>`;
              
              // Add nested lists if present
              if (item.hasNestedList && item.nestedLists) {
                item.nestedLists.forEach(nestedList => {
                  if (nestedList.type === 'ordered') {
                    htmlContent += '<ol>';
                  } else {
                    htmlContent += '<ul>';
                  }
                  
                  nestedList.items.forEach(nestedItem => {
                    htmlContent += `<li>${nestedItem}</li>`;
                  });
                  
                  if (nestedList.type === 'ordered') {
                    htmlContent += '</ol>';
                  } else {
                    htmlContent += '</ul>';
                  }
                });
              }
            });
            
            if (list.type === 'ordered') {
              htmlContent += '</ol>';
            } else {
              htmlContent += '</ul>';
            }
          });
        }
        break;
        
      case 'form':
        if (data.data.forms && data.data.forms.length > 0) {
          data.data.forms.forEach((form, index) => {
            htmlContent += `<h2>Form ${index + 1}</h2>`;
            htmlContent += `<p>Action: ${form.action}</p>`;
            htmlContent += `<p>Method: ${form.method}</p>`;
            
            htmlContent += '<table>';
            htmlContent += '<thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Value</th></tr></thead>';
            htmlContent += '<tbody>';
            
            form.fields.forEach(field => {
              // Don't display sensitive fields
              if (field.isSensitive) {
                htmlContent += `<tr><td>${field.label || field.name}</td><td>${field.type}</td><td>${field.required ? 'Yes' : 'No'}</td><td>[SENSITIVE]</td></tr>`;
              } else {
                htmlContent += `<tr><td>${field.label || field.name}</td><td>${field.type}</td><td>${field.required ? 'Yes' : 'No'}</td><td>${field.value}</td></tr>`;
              }
            });
            
            htmlContent += '</tbody></table>';
          });
        }
        break;
        
      case 'products':
        if (data.data.products && data.data.products.length > 0) {
          htmlContent += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); grid-gap: 20px;">';
          
          data.data.products.forEach(product => {
            htmlContent += `
              <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
                <h3>${product.title}</h3>
                ${product.image ? `<img src="${product.image}" alt="${product.title}" style="max-width: 100%; height: auto; margin-bottom: 10px;">` : ''}
                ${product.price ? `<p style="font-weight: bold; color: #e63946;">Price: ${product.price}</p>` : ''}
                ${product.rating ? `<p>Rating: ${product.rating}</p>` : ''}
                ${product.description ? `<p>${product.description}</p>` : ''}
                ${product.link ? `<p><a href="${product.link}" target="_blank">View Product</a></p>` : ''}
              </div>
            `;
          });
          
          htmlContent += '</div>';
        }
        break;
        
      case 'search_results':
      case 'feed':
        const items = data.data.results || data.data.items;
        if (items) {
          // Show query if available
          if (data.data.query) {
            htmlContent += `<p>Search Query: <strong>${data.data.query}</strong></p>`;
          }
          
          // Display results in a list
          htmlContent += '<div style="display: flex; flex-direction: column; gap: 15px;">';
          
          items.forEach(item => {
            htmlContent += `
              <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
                <h3>${item.title}</h3>
                ${item.description ? `<p>${item.description}</p>` : ''}
                ${item.link ? `<p><a href="${item.link}" target="_blank">View Result</a></p>` : ''}
              </div>
            `;
          });
          
          htmlContent += '</div>';
        }
        break;
        
      case 'structured_data':
        htmlContent += '<h2>Structured Data</h2>';
        
        // Display JSON-LD
        if (data.data.jsonLd && data.data.jsonLd.length > 0) {
          htmlContent += '<h3>JSON-LD</h3>';
          htmlContent += '<pre style="background-color: #f5f5f5; padding: 15px; overflow: auto; max-height: 400px;">';
          htmlContent += JSON.stringify(data.data.jsonLd, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          htmlContent += '</pre>';
        }
        
        // Display Meta Tags
        if (data.data.meta && Object.keys(data.data.meta).length > 0) {
          htmlContent += '<h3>Meta Tags</h3>';
          htmlContent += '<table>';
          htmlContent += '<thead><tr><th>Property</th><th>Content</th></tr></thead>';
          htmlContent += '<tbody>';
          
          for (const [key, value] of Object.entries(data.data.meta)) {
            if (typeof value === 'object') {
              for (const [subKey, subValue] of Object.entries(value)) {
                htmlContent += `<tr><td>${key}:${subKey}</td><td>${subValue}</td></tr>`;
              }
            } else {
              htmlContent += `<tr><td>${key}</td><td>${value}</td></tr>`;
            }
          }
          
          htmlContent += '</tbody></table>';
        }
        break;
        
      default:
        // For other types, just display JSON
        htmlContent += '<h2>Raw Data</h2>';
        htmlContent += '<pre style="background-color: #f5f5f5; padding: 15px; overflow: auto;">';
        htmlContent += JSON.stringify(data.data, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        htmlContent += '</pre>';
    }
    
    // Close HTML tags
    htmlContent += `
        </div>
      </body>
      </html>
    `;
    
    // Write to file
    await fs.promises.writeFile(filePath, htmlContent);
  }
}

module.exports = ExtractAPI; 