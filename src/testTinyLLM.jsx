// Test.jsx or anywhere in your app
import { JSONParser } from 'tinyllm/parsers/json';

function TestTinyLLM() {
  const parser = new JSONParser();
  
  // This URL was getting truncated before
  const brokenJSON = `{
    "url": "https://login.salesforce.com/services/oauth2/token",
    "name": "test",
  }`;
  
  const result = parser.fix(brokenJSON);
  
  console.log('=== TinyLLM Test ===');
  console.log('Success:', result.success);
  console.log('Fixed JSON:', result.fixed);
  console.log('Fixes applied:', result.fixes);
  
  // Check if URL is intact
  const hasFullURL = result.fixed.includes('https://login.salesforce.com/services/oauth2/token');
  console.log(hasFullURL ? '✅ URL PRESERVED!' : '❌ URL TRUNCATED (old version)');
  
  return (
    <div style={{ padding: 20 }}>
      <h2>TinyLLM Test</h2>
      <pre>{JSON.stringify(result, null, 2)}</pre>
      <p style={{ 
        color: hasFullURL ? 'green' : 'red',
        fontWeight: 'bold' 
      }}>
        {hasFullURL ? '✅ Working correctly!' : '❌ Still using old version'}
      </p>
    </div>
  );
}

export default TestTinyLLM;
