/**
 * Language-specific keyword and snippet completions
 * Phase 1: Static completion system
 */

// JavaScript/TypeScript completions
export const javascriptCompletions = [
  // Keywords
  { label: 'const', type: 'keyword', info: 'Declare a constant variable' },
  { label: 'let', type: 'keyword', info: 'Declare a block-scoped variable' },
  { label: 'var', type: 'keyword', info: 'Declare a variable' },
  { label: 'function', type: 'keyword', info: 'Declare a function' },
  { label: 'async', type: 'keyword', info: 'Async function modifier' },
  { label: 'await', type: 'keyword', info: 'Wait for promise resolution' },
  { label: 'return', type: 'keyword', info: 'Return from function' },
  { label: 'if', type: 'keyword', info: 'Conditional statement' },
  { label: 'else', type: 'keyword', info: 'Alternative conditional' },
  { label: 'for', type: 'keyword', info: 'For loop' },
  { label: 'while', type: 'keyword', info: 'While loop' },
  { label: 'do', type: 'keyword', info: 'Do-while loop' },
  { label: 'switch', type: 'keyword', info: 'Switch statement' },
  { label: 'case', type: 'keyword', info: 'Switch case' },
  { label: 'default', type: 'keyword', info: 'Default case' },
  { label: 'break', type: 'keyword', info: 'Break from loop/switch' },
  { label: 'continue', type: 'keyword', info: 'Continue to next iteration' },
  { label: 'try', type: 'keyword', info: 'Try block for error handling' },
  { label: 'catch', type: 'keyword', info: 'Catch errors' },
  { label: 'finally', type: 'keyword', info: 'Finally block' },
  { label: 'throw', type: 'keyword', info: 'Throw an error' },
  { label: 'class', type: 'keyword', info: 'Declare a class' },
  { label: 'extends', type: 'keyword', info: 'Extend a class' },
  { label: 'import', type: 'keyword', info: 'Import module' },
  { label: 'export', type: 'keyword', info: 'Export module member' },
  { label: 'from', type: 'keyword', info: 'Import from module' },
  { label: 'new', type: 'keyword', info: 'Create instance' },
  { label: 'this', type: 'keyword', info: 'Current context' },
  { label: 'typeof', type: 'keyword', info: 'Get type of value' },
  { label: 'instanceof', type: 'keyword', info: 'Check instance type' },
  { label: 'null', type: 'keyword', info: 'Null value' },
  { label: 'undefined', type: 'keyword', info: 'Undefined value' },
  { label: 'true', type: 'keyword', info: 'Boolean true' },
  { label: 'false', type: 'keyword', info: 'Boolean false' },

  // Common snippets
  {
    label: 'log',
    type: 'snippet',
    apply: 'console.log(${1})',
    detail: 'console.log()',
    info: 'Log to console'
  },
  {
    label: 'func',
    type: 'snippet',
    apply: 'function ${1:name}(${2:params}) {\n  ${3}\n}',
    detail: 'function declaration',
    info: 'Create a function'
  },
  {
    label: 'afunc',
    type: 'snippet',
    apply: 'async function ${1:name}(${2:params}) {\n  ${3}\n}',
    detail: 'async function',
    info: 'Create an async function'
  },
  {
    label: 'arrow',
    type: 'snippet',
    apply: 'const ${1:name} = (${2:params}) => {\n  ${3}\n}',
    detail: 'arrow function',
    info: 'Arrow function'
  },
  {
    label: 'aarrow',
    type: 'snippet',
    apply: 'const ${1:name} = async (${2:params}) => {\n  ${3}\n}',
    detail: 'async arrow function',
    info: 'Async arrow function'
  },
  {
    label: 'iif',
    type: 'snippet',
    apply: 'if (${1:condition}) {\n  ${2}\n}',
    detail: 'if statement',
    info: 'If conditional'
  },
  {
    label: 'ifelse',
    type: 'snippet',
    apply: 'if (${1:condition}) {\n  ${2}\n} else {\n  ${3}\n}',
    detail: 'if-else statement',
    info: 'If-else conditional'
  },
  {
    label: 'ffor',
    type: 'snippet',
    apply: 'for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n  ${3}\n}',
    detail: 'for loop',
    info: 'For loop'
  },
  {
    label: 'foreach',
    type: 'snippet',
    apply: '${1:array}.forEach((${2:item}) => {\n  ${3}\n})',
    detail: 'forEach loop',
    info: 'ForEach loop'
  },
  {
    label: 'forof',
    type: 'snippet',
    apply: 'for (const ${1:item} of ${2:array}) {\n  ${3}\n}',
    detail: 'for-of loop',
    info: 'For-of loop'
  },
  {
    label: 'forin',
    type: 'snippet',
    apply: 'for (const ${1:key} in ${2:object}) {\n  ${3}\n}',
    detail: 'for-in loop',
    info: 'For-in loop'
  },
  {
    label: 'trycatch',
    type: 'snippet',
    apply: 'try {\n  ${1}\n} catch (${2:error}) {\n  ${3}\n}',
    detail: 'try-catch',
    info: 'Try-catch block'
  },
  {
    label: 'class',
    type: 'snippet',
    apply: 'class ${1:ClassName} {\n  constructor(${2:params}) {\n    ${3}\n  }\n}',
    detail: 'class declaration',
    info: 'Create a class'
  },
  {
    label: 'import',
    type: 'snippet',
    apply: 'import { ${1} } from \'${2:module}\'',
    detail: 'import statement',
    info: 'Import from module'
  },
  {
    label: 'importall',
    type: 'snippet',
    apply: 'import * as ${1:name} from \'${2:module}\'',
    detail: 'import all',
    info: 'Import all from module'
  },
  {
    label: 'export',
    type: 'snippet',
    apply: 'export { ${1} }',
    detail: 'export statement',
    info: 'Export members'
  },
  {
    label: 'exportdefault',
    type: 'snippet',
    apply: 'export default ${1}',
    detail: 'export default',
    info: 'Default export'
  }
];

// Python completions
export const pythonCompletions = [
  // Keywords
  { label: 'def', type: 'keyword', info: 'Define a function' },
  { label: 'class', type: 'keyword', info: 'Define a class' },
  { label: 'if', type: 'keyword', info: 'Conditional statement' },
  { label: 'elif', type: 'keyword', info: 'Else if' },
  { label: 'else', type: 'keyword', info: 'Else clause' },
  { label: 'for', type: 'keyword', info: 'For loop' },
  { label: 'while', type: 'keyword', info: 'While loop' },
  { label: 'in', type: 'keyword', info: 'Membership test' },
  { label: 'return', type: 'keyword', info: 'Return from function' },
  { label: 'yield', type: 'keyword', info: 'Yield from generator' },
  { label: 'import', type: 'keyword', info: 'Import module' },
  { label: 'from', type: 'keyword', info: 'Import from module' },
  { label: 'as', type: 'keyword', info: 'Alias' },
  { label: 'try', type: 'keyword', info: 'Try block' },
  { label: 'except', type: 'keyword', info: 'Exception handler' },
  { label: 'finally', type: 'keyword', info: 'Finally block' },
  { label: 'raise', type: 'keyword', info: 'Raise exception' },
  { label: 'with', type: 'keyword', info: 'Context manager' },
  { label: 'pass', type: 'keyword', info: 'No operation' },
  { label: 'break', type: 'keyword', info: 'Break loop' },
  { label: 'continue', type: 'keyword', info: 'Continue loop' },
  { label: 'lambda', type: 'keyword', info: 'Anonymous function' },
  { label: 'True', type: 'keyword', info: 'Boolean true' },
  { label: 'False', type: 'keyword', info: 'Boolean false' },
  { label: 'None', type: 'keyword', info: 'None value' },
  { label: 'and', type: 'keyword', info: 'Logical AND' },
  { label: 'or', type: 'keyword', info: 'Logical OR' },
  { label: 'not', type: 'keyword', info: 'Logical NOT' },
  { label: 'is', type: 'keyword', info: 'Identity test' },
  { label: 'async', type: 'keyword', info: 'Async function' },
  { label: 'await', type: 'keyword', info: 'Await coroutine' },

  // Snippets
  {
    label: 'print',
    type: 'snippet',
    apply: 'print(${1})',
    detail: 'print()',
    info: 'Print to console'
  },
  {
    label: 'def',
    type: 'snippet',
    apply: 'def ${1:function_name}(${2:params}):\n    ${3:pass}',
    detail: 'function definition',
    info: 'Define function'
  },
  {
    label: 'class',
    type: 'snippet',
    apply: 'class ${1:ClassName}:\n    def __init__(self${2:, params}):\n        ${3:pass}',
    detail: 'class definition',
    info: 'Define class'
  },
  {
    label: 'if',
    type: 'snippet',
    apply: 'if ${1:condition}:\n    ${2:pass}',
    detail: 'if statement',
    info: 'If statement'
  },
  {
    label: 'ifelse',
    type: 'snippet',
    apply: 'if ${1:condition}:\n    ${2:pass}\nelse:\n    ${3:pass}',
    detail: 'if-else statement',
    info: 'If-else statement'
  },
  {
    label: 'for',
    type: 'snippet',
    apply: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}',
    detail: 'for loop',
    info: 'For loop'
  },
  {
    label: 'while',
    type: 'snippet',
    apply: 'while ${1:condition}:\n    ${2:pass}',
    detail: 'while loop',
    info: 'While loop'
  },
  {
    label: 'try',
    type: 'snippet',
    apply: 'try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:pass}',
    detail: 'try-except',
    info: 'Try-except block'
  },
  {
    label: 'with',
    type: 'snippet',
    apply: 'with ${1:expression} as ${2:variable}:\n    ${3:pass}',
    detail: 'with statement',
    info: 'Context manager'
  },
  {
    label: 'import',
    type: 'snippet',
    apply: 'import ${1:module}',
    detail: 'import statement',
    info: 'Import module'
  },
  {
    label: 'from',
    type: 'snippet',
    apply: 'from ${1:module} import ${2:name}',
    detail: 'from import',
    info: 'Import from module'
  }
];

// Java completions
export const javaCompletions = [
  // Keywords
  { label: 'public', type: 'keyword', info: 'Public access modifier' },
  { label: 'private', type: 'keyword', info: 'Private access modifier' },
  { label: 'protected', type: 'keyword', info: 'Protected access modifier' },
  { label: 'static', type: 'keyword', info: 'Static member' },
  { label: 'final', type: 'keyword', info: 'Final/constant' },
  { label: 'class', type: 'keyword', info: 'Class declaration' },
  { label: 'interface', type: 'keyword', info: 'Interface declaration' },
  { label: 'extends', type: 'keyword', info: 'Inheritance' },
  { label: 'implements', type: 'keyword', info: 'Interface implementation' },
  { label: 'void', type: 'keyword', info: 'No return type' },
  { label: 'int', type: 'keyword', info: 'Integer type' },
  { label: 'long', type: 'keyword', info: 'Long integer type' },
  { label: 'float', type: 'keyword', info: 'Float type' },
  { label: 'double', type: 'keyword', info: 'Double type' },
  { label: 'boolean', type: 'keyword', info: 'Boolean type' },
  { label: 'char', type: 'keyword', info: 'Character type' },
  { label: 'String', type: 'keyword', info: 'String type' },
  { label: 'if', type: 'keyword', info: 'Conditional statement' },
  { label: 'else', type: 'keyword', info: 'Else clause' },
  { label: 'for', type: 'keyword', info: 'For loop' },
  { label: 'while', type: 'keyword', info: 'While loop' },
  { label: 'do', type: 'keyword', info: 'Do-while loop' },
  { label: 'switch', type: 'keyword', info: 'Switch statement' },
  { label: 'case', type: 'keyword', info: 'Switch case' },
  { label: 'default', type: 'keyword', info: 'Default case' },
  { label: 'break', type: 'keyword', info: 'Break statement' },
  { label: 'continue', type: 'keyword', info: 'Continue statement' },
  { label: 'return', type: 'keyword', info: 'Return statement' },
  { label: 'try', type: 'keyword', info: 'Try block' },
  { label: 'catch', type: 'keyword', info: 'Catch exception' },
  { label: 'finally', type: 'keyword', info: 'Finally block' },
  { label: 'throw', type: 'keyword', info: 'Throw exception' },
  { label: 'throws', type: 'keyword', info: 'Throws declaration' },
  { label: 'new', type: 'keyword', info: 'Create instance' },
  { label: 'this', type: 'keyword', info: 'Current instance' },
  { label: 'super', type: 'keyword', info: 'Parent class' },
  { label: 'null', type: 'keyword', info: 'Null value' },
  { label: 'true', type: 'keyword', info: 'Boolean true' },
  { label: 'false', type: 'keyword', info: 'Boolean false' },

  // Snippets
  {
    label: 'sout',
    type: 'snippet',
    apply: 'System.out.println(${1});',
    detail: 'System.out.println',
    info: 'Print to console'
  },
  {
    label: 'main',
    type: 'snippet',
    apply: 'public static void main(String[] args) {\n    ${1}\n}',
    detail: 'main method',
    info: 'Main method'
  },
  {
    label: 'class',
    type: 'snippet',
    apply: 'public class ${1:ClassName} {\n    ${2}\n}',
    detail: 'class declaration',
    info: 'Class declaration'
  },
  {
    label: 'if',
    type: 'snippet',
    apply: 'if (${1:condition}) {\n    ${2}\n}',
    detail: 'if statement',
    info: 'If statement'
  },
  {
    label: 'ifelse',
    type: 'snippet',
    apply: 'if (${1:condition}) {\n    ${2}\n} else {\n    ${3}\n}',
    detail: 'if-else statement',
    info: 'If-else statement'
  },
  {
    label: 'for',
    type: 'snippet',
    apply: 'for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n    ${3}\n}',
    detail: 'for loop',
    info: 'For loop'
  },
  {
    label: 'foreach',
    type: 'snippet',
    apply: 'for (${1:Type} ${2:item} : ${3:collection}) {\n    ${4}\n}',
    detail: 'for-each loop',
    info: 'Enhanced for loop'
  },
  {
    label: 'while',
    type: 'snippet',
    apply: 'while (${1:condition}) {\n    ${2}\n}',
    detail: 'while loop',
    info: 'While loop'
  },
  {
    label: 'try',
    type: 'snippet',
    apply: 'try {\n    ${1}\n} catch (${2:Exception} ${3:e}) {\n    ${4}\n}',
    detail: 'try-catch',
    info: 'Try-catch block'
  }
];

// C/C++ completions
export const cppCompletions = [
  // Keywords
  { label: 'int', type: 'keyword', info: 'Integer type' },
  { label: 'long', type: 'keyword', info: 'Long integer' },
  { label: 'short', type: 'keyword', info: 'Short integer' },
  { label: 'float', type: 'keyword', info: 'Floating point' },
  { label: 'double', type: 'keyword', info: 'Double precision float' },
  { label: 'char', type: 'keyword', info: 'Character type' },
  { label: 'bool', type: 'keyword', info: 'Boolean type' },
  { label: 'void', type: 'keyword', info: 'No type' },
  { label: 'auto', type: 'keyword', info: 'Auto type deduction' },
  { label: 'const', type: 'keyword', info: 'Constant' },
  { label: 'static', type: 'keyword', info: 'Static storage' },
  { label: 'extern', type: 'keyword', info: 'External linkage' },
  { label: 'struct', type: 'keyword', info: 'Structure' },
  { label: 'class', type: 'keyword', info: 'Class (C++)' },
  { label: 'public', type: 'keyword', info: 'Public access' },
  { label: 'private', type: 'keyword', info: 'Private access' },
  { label: 'protected', type: 'keyword', info: 'Protected access' },
  { label: 'if', type: 'keyword', info: 'Conditional' },
  { label: 'else', type: 'keyword', info: 'Else clause' },
  { label: 'for', type: 'keyword', info: 'For loop' },
  { label: 'while', type: 'keyword', info: 'While loop' },
  { label: 'do', type: 'keyword', info: 'Do-while loop' },
  { label: 'switch', type: 'keyword', info: 'Switch statement' },
  { label: 'case', type: 'keyword', info: 'Switch case' },
  { label: 'default', type: 'keyword', info: 'Default case' },
  { label: 'break', type: 'keyword', info: 'Break statement' },
  { label: 'continue', type: 'keyword', info: 'Continue statement' },
  { label: 'return', type: 'keyword', info: 'Return statement' },
  { label: 'sizeof', type: 'keyword', info: 'Size of type' },
  { label: 'typedef', type: 'keyword', info: 'Type definition' },
  { label: 'namespace', type: 'keyword', info: 'Namespace (C++)' },
  { label: 'using', type: 'keyword', info: 'Using declaration' },
  { label: 'template', type: 'keyword', info: 'Template (C++)' },
  { label: 'virtual', type: 'keyword', info: 'Virtual function' },
  { label: 'nullptr', type: 'keyword', info: 'Null pointer (C++)' },
  { label: 'NULL', type: 'keyword', info: 'Null pointer' },
  { label: 'true', type: 'keyword', info: 'Boolean true' },
  { label: 'false', type: 'keyword', info: 'Boolean false' },

  // Snippets
  {
    label: 'include',
    type: 'snippet',
    apply: '#include <${1:iostream}>',
    detail: '#include directive',
    info: 'Include header'
  },
  {
    label: 'main',
    type: 'snippet',
    apply: 'int main() {\n    ${1}\n    return 0;\n}',
    detail: 'main function',
    info: 'Main function'
  },
  {
    label: 'if',
    type: 'snippet',
    apply: 'if (${1:condition}) {\n    ${2}\n}',
    detail: 'if statement',
    info: 'If statement'
  },
  {
    label: 'for',
    type: 'snippet',
    apply: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${3}\n}',
    detail: 'for loop',
    info: 'For loop'
  },
  {
    label: 'while',
    type: 'snippet',
    apply: 'while (${1:condition}) {\n    ${2}\n}',
    detail: 'while loop',
    info: 'While loop'
  },
  {
    label: 'cout',
    type: 'snippet',
    apply: 'std::cout << ${1} << std::endl;',
    detail: 'cout statement',
    info: 'Console output (C++)'
  },
  {
    label: 'printf',
    type: 'snippet',
    apply: 'printf("${1:%s}\\n", ${2});',
    detail: 'printf statement',
    info: 'Formatted output'
  },
  {
    label: 'class',
    type: 'snippet',
    apply: 'class ${1:ClassName} {\npublic:\n    ${1:ClassName}();\n    ~${1:ClassName}();\n    ${2}\n};',
    detail: 'class definition',
    info: 'Class definition (C++)'
  }
];

// Common completions for all languages
export const commonCompletions = [
  { label: 'TODO', type: 'comment', apply: '// TODO: ${1}', info: 'TODO comment' },
  { label: 'FIXME', type: 'comment', apply: '// FIXME: ${1}', info: 'FIXME comment' },
  { label: 'NOTE', type: 'comment', apply: '// NOTE: ${1}', info: 'NOTE comment' },
  { label: 'HACK', type: 'comment', apply: '// HACK: ${1}', info: 'HACK comment' },
];

// Get completions for specific language
export function getLanguageCompletions(language) {
  const langMap = {
    'javascript': javascriptCompletions,
    'typescript': javascriptCompletions,
    'jsx': javascriptCompletions,
    'tsx': javascriptCompletions,
    'python': pythonCompletions,
    'java': javaCompletions,
    'cpp': cppCompletions,
    'c': cppCompletions,
  };

  const languageSpecific = langMap[language] || [];
  return [...languageSpecific, ...commonCompletions];
}
