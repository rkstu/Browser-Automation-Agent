/**
 * Sample workflow: GitHub Login
 * 
 * This example demonstrates how to use the InteractAPI to automate a 
 * GitHub login workflow using natural language commands.
 * 
 * NOTE: Replace USERNAME and PASSWORD with your actual GitHub credentials.
 */

const InteractAPI = require('../InteractAPI');

// Replace with your GitHub credentials
const GITHUB_USERNAME = 'your-username';
const GITHUB_PASSWORD = 'your-password';

async function runGitHubLoginWorkflow() {
  // Create and initialize InteractAPI instance
  const interact = new InteractAPI();
  
  try {
    console.log('Initializing browser...');
    await interact.initialize();
    console.log('Browser initialized.');
    
    // Navigate to GitHub
    console.log('\nStep 1: Navigating to GitHub...');
    await interact.executeCommand('go to github.com');
    
    // Click on Sign in
    console.log('\nStep 2: Clicking on Sign in...');
    await interact.executeCommand('click on Sign in');
    
    // Enter username
    console.log('\nStep 3: Entering username...');
    await interact.executeCommand(`type ${GITHUB_USERNAME} in the username field`);
    
    // Enter password
    console.log('\nStep 4: Entering password...');
    await interact.executeCommand(`type ${GITHUB_PASSWORD} in the password field`);
    
    // Click Sign in button
    console.log('\nStep 5: Clicking Sign in button...');
    await interact.executeCommand('click on the Sign in button');
    
    // Wait for dashboard to load
    console.log('\nStep 6: Waiting for dashboard to load...');
    await interact.executeCommand('wait 3000');
    
    // Take a screenshot
    console.log('\nStep 7: Taking a screenshot...');
    await interact.executeCommand('screenshot github-login-result.png');
    
    console.log('\nWorkflow completed successfully!');
    console.log('Screenshot saved as github-login-result.png');
    
  } catch (error) {
    console.error('Workflow failed:', error);
  } finally {
    // Always close the browser
    console.log('\nClosing browser...');
    await interact.close();
  }
}

// Run the workflow
if (require.main === module) {
  console.log('Running GitHub login workflow...');
  runGitHubLoginWorkflow().catch(console.error);
}

module.exports = runGitHubLoginWorkflow; 