/**
 * Completion source for CodeMirror
 * Handles keyword, snippet, symbol, and AI-powered completion
 */

import { getLanguageCompletions } from './languageCompletions';
import { aiCompletionService } from './aiCompletionService';

/**
 * Extract symbols (variables, functions, classes) from document
 */
function extractSymbols(doc, language) {
  const text = doc.toString();
  const symbols = new Set();

  // Language-specific patterns for symbol extraction
  const patterns = {
    javascript: [
      /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,  // Variables
      /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,           // Functions
      /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,               // Classes
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:=]\s*function/g,      // Function expressions
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:=]\s*\(/g,            // Arrow functions
    ],
    typescript: [
      /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      /\binterface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,          // Interfaces
      /\btype\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,               // Type aliases
      /\benum\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,               // Enums
    ],
    python: [
      /\bdef\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,                  // Functions
      /\bclass\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,                // Classes
      /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm,                    // Variables
    ],
    java: [
      /\b(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,  // Methods
      /\b(?:public|private|protected)?\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,  // Classes
      /\b(?:public|private|protected)?\s*interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,  // Interfaces
      /\b(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[;=]/g,  // Fields
    ],
    cpp: [
      /\b(?:int|long|short|float|double|char|bool|void|auto)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,  // Variables
      /\b(?:class|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,     // Classes/Structs
      /\b\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,             // Functions
    ],
    c: [
      /\b(?:int|long|short|float|double|char|void)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,  // Variables
      /\bstruct\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,               // Structs
      /\b\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,             // Functions
    ]
  };

  const langPatterns = patterns[language] || patterns.javascript;

  langPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && match[1].length > 1) {
        symbols.add(match[1]);
      }
    }
  });

  return Array.from(symbols).map(symbol => ({
    label: symbol,
    type: 'variable',
    info: 'Symbol from document'
  }));
}

/**
 * Extract import paths for path completion
 */
function extractImportPaths(doc, language) {
  const text = doc.toString();
  const paths = new Set();

  if (language === 'javascript' || language === 'typescript' ||
      language === 'jsx' || language === 'tsx') {
    // Match import statements
    const importPattern = /(?:import|from)\s+['"](.*?)['"]/g;
    let match;
    while ((match = importPattern.exec(text)) !== null) {
      if (match[1]) {
        paths.add(match[1]);
      }
    }
  } else if (language === 'python') {
    // Match Python imports
    const importPattern = /(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g;
    let match;
    while ((match = importPattern.exec(text)) !== null) {
      if (match[1]) {
        paths.add(match[1]);
      }
    }
  }

  return Array.from(paths).map(path => ({
    label: path,
    type: 'module',
    info: 'Imported module'
  }));
}

/**
 * Process snippet apply text to handle placeholders
 * Converts ${1:name} style placeholders to just the text
 */
function processSnippetText(text) {
  // Simple placeholder removal for basic completion
  // Replace ${n:text} with text, ${n} with empty
  return text
    .replace(/\$\{(\d+):([^}]+)\}/g, '$2')  // ${1:name} -> name
    .replace(/\$\{(\d+)\}/g, '');            // ${1} -> empty
}

/**
 * Main completion source function
 */
export function createCompletionSource(language) {
  return function completionSource(context) {
    // Get word before cursor
    const word = context.matchBefore(/\w*/);

    // Don't show completions if we're not at a word boundary
    if (!word || (word.from === word.to && !context.explicit)) {
      return null;
    }

    // Get language-specific completions
    const languageCompletions = getLanguageCompletions(language);

    // Extract symbols from document
    const documentSymbols = extractSymbols(context.state.doc, language);

    // Extract import paths
    const importPaths = extractImportPaths(context.state.doc, language);

    // Combine all completions
    const allCompletions = [
      ...languageCompletions,
      ...documentSymbols,
      ...importPaths
    ];

    // Filter based on current word
    const filtered = allCompletions.filter(completion =>
      completion.label.toLowerCase().startsWith(word.text.toLowerCase())
    );

    // Sort by relevance (exact match first, then alphabetically)
    filtered.sort((a, b) => {
      const aExact = a.label.toLowerCase() === word.text.toLowerCase();
      const bExact = b.label.toLowerCase() === word.text.toLowerCase();

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      return a.label.localeCompare(b.label);
    });

    // Map to CodeMirror completion format
    const options = filtered.map(completion => {
      const option = {
        label: completion.label,
        type: completion.type || 'text',
      };

      // Add detail if available
      if (completion.detail) {
        option.detail = completion.detail;
      }

      // Add info if available
      if (completion.info) {
        option.info = completion.info;
      }

      // Handle snippets with apply function
      if (completion.apply) {
        if (typeof completion.apply === 'string') {
          // Process snippet text for simple completion
          const processed = processSnippetText(completion.apply);
          option.apply = processed;
          option.detail = completion.detail || 'snippet';
        } else {
          option.apply = completion.apply;
        }
      }

      return option;
    });

    return {
      from: word.from,
      options,
      validFor: /^\w*$/
    };
  };
}

/**
 * Create a smart completion source that adapts to context
 * Includes AI-powered suggestions when enabled
 */
export function createSmartCompletionSource(language, aiSettings = null) {
  const baseSource = createCompletionSource(language);

  // Initialize AI service if settings provided
  if (aiSettings) {
    aiCompletionService.updateSettings(aiSettings);
  }

  return async function smartCompletionSource(context) {
    // Check if we're in a string (for path completion)
    // Add bounds checking to prevent "No tile at position" errors
    const doc = context.state.doc;
    const pos = Math.max(0, Math.min(context.pos, doc.length));

    let line, lineText, posInLine, beforeCursor;
    try {
      line = doc.lineAt(pos);
      lineText = line.text;
      posInLine = pos - line.from;
      beforeCursor = lineText.substring(0, posInLine);
    } catch (error) {
      console.warn('[Completion] Failed to get line at position:', error);
      return null;
    }

    // Check if we're in an import statement
    const inImport = /(?:import|from)\s+['"][^'"]*$/.test(beforeCursor);

    if (inImport) {
      // Enhanced path completion in import statements
      const pathMatch = beforeCursor.match(/['"]([^'"]*?)$/);
      if (pathMatch) {
        const currentPath = pathMatch[1];
        const importPaths = extractImportPaths(context.state.doc, language);

        // Filter paths that start with current input
        const filtered = importPaths.filter(p =>
          p.label.startsWith(currentPath)
        );

        if (filtered.length > 0) {
          return {
            from: context.pos - currentPath.length,
            options: filtered.map(p => ({
              label: p.label,
              type: 'module',
              info: p.info
            })),
            validFor: /^[^\s'"]*$/
          };
        }
      }
    }

    // Get base completions
    const baseResult = baseSource(context);
    if (!baseResult) return null;

    // Try to get AI suggestions in parallel (don't block base completions)
    let aiSuggestions = [];
    if (aiCompletionService.isEnabled() && context.explicit) {
      // Only fetch AI suggestions for explicit completion requests (Ctrl+Space)
      // to avoid too many API calls
      try {
        aiSuggestions = await aiCompletionService.getSuggestions(
          context.state.doc,
          context.pos,
          language
        );
      } catch (error) {
        console.warn('AI completion failed:', error);
      }
    }

    // Merge AI suggestions with base completions
    const allOptions = [
      ...aiSuggestions,
      ...baseResult.options
    ];

    // Sort by boost/priority
    allOptions.sort((a, b) => {
      const aBoost = a.boost || 0;
      const bBoost = b.boost || 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return a.label.localeCompare(b.label);
    });

    return {
      from: baseResult.from,
      options: allOptions,
      validFor: baseResult.validFor
    };
  };
}
