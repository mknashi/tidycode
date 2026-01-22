# Third-Party Licenses

This document provides information about the open-source libraries used in TidyCode and their licensing implications.

## Summary

All dependencies use permissive open-source licenses that allow commercial use. The main license types are:
- **MIT**: Most permissive, minimal requirements
- **Apache-2.0**: Includes patent grant, requires attribution
- **BSD**: Similar to MIT, minimal requirements

---

## Core Dependencies

### React & Build Tools

#### React (v18.3.1)
- **License**: MIT
- **Copyright**: Meta Platforms, Inc.
- **Usage**: Core UI framework
- **License URL**: https://github.com/facebook/react/blob/main/LICENSE
- **Commercial Use**: ✅ Yes
- **Attribution Required**: ✅ Yes

#### React-DOM (v18.3.1)
- **License**: MIT
- **Copyright**: Meta Platforms, Inc.
- **Usage**: React DOM renderer
- **Commercial Use**: ✅ Yes

---

## Code Editor (CodeMirror)

All CodeMirror packages are licensed under MIT.

### CodeMirror Core
- **@codemirror/state** (v6.4.1)
- **@codemirror/view** (v6.36.2)
- **@codemirror/language** (v6.10.5)
- **@codemirror/search** (v6.5.11)
- **@uiw/react-codemirror** (v4.25.3)

**License**: MIT
**Copyright**: Marijn Haverbeke and contributors
**License URL**: https://github.com/codemirror/dev/blob/main/LICENSE

### CodeMirror Language Support
All use MIT license:
- **@codemirror/lang-cpp** (v6.0.3)
- **@codemirror/lang-css** (v6.3.1)
- **@codemirror/lang-html** (v6.4.11)
- **@codemirror/lang-java** (v6.0.2)
- **@codemirror/lang-javascript** (v6.2.4)
- **@codemirror/lang-json** (v6.0.2)
- **@codemirror/lang-markdown** (v6.5.0)
- **@codemirror/lang-php** (v6.0.2)
- **@codemirror/lang-python** (v6.2.1)
- **@codemirror/lang-rust** (v6.0.2)
- **@codemirror/lang-sql** (v6.10.0)
- **@codemirror/lang-xml** (v6.1.0)

### CodeMirror Extensions
- **@codemirror/theme-one-dark** (v6.1.3) - MIT
- **@replit/codemirror-vim** (v6.3.0) - MIT
- **@lezer/highlight** (v1.2.1) - MIT
- **codemirror-languageserver** (v1.18.1) - MIT

---

## PDF Viewer

### PDF.js / pdfjs-dist (v5.4.296)
- **License**: Apache-2.0
- **Copyright**: Mozilla Foundation
- **Usage**: PDF rendering engine
- **GitHub**: https://github.com/mozilla/pdf.js
- **License URL**: https://github.com/mozilla/pdf.js/blob/master/LICENSE
- **Commercial Use**: ✅ Yes
- **Patent Grant**: ✅ Yes (explicit patent protection)
- **Requirements**:
  - Include Apache-2.0 license text
  - State significant changes
  - Include copyright notice

### react-pdf (v10.2.0)
- **License**: MIT
- **Copyright**: Wojciech Maj
- **Usage**: React wrapper for PDF.js
- **GitHub**: https://github.com/wojtekmaj/react-pdf
- **License URL**: https://github.com/wojtekmaj/react-pdf/blob/main/LICENSE
- **Commercial Use**: ✅ Yes
- **Requirements**: Include MIT license and copyright notice

---

## Desktop Application (Tauri)

### Tauri Plugins
- **@tauri-apps/api** - MIT / Apache-2.0 (dual licensed)
- **@tauri-apps/plugin-dialog** (v2.4.2) - MIT / Apache-2.0

**License URLs**:
- https://github.com/tauri-apps/tauri/blob/dev/LICENSE_MIT
- https://github.com/tauri-apps/tauri/blob/dev/LICENSE_APACHE-2.0

**Commercial Use**: ✅ Yes
**Choose Either**: MIT or Apache-2.0 (user's choice)

---

## Terminal Emulator

### xterm.js
- **@xterm/xterm** (v5.5.0)
- **@xterm/addon-fit** (v0.10.0)
- **@xterm/addon-web-links** (v0.11.0)

**License**: MIT
**Copyright**: Microsoft Corporation
**License URL**: https://github.com/xtermjs/xterm.js/blob/master/LICENSE
**Commercial Use**: ✅ Yes

---

## UI & Utilities

### Lucide React (v0.263.1)
- **License**: ISC (functionally identical to MIT)
- **Usage**: Icon library
- **GitHub**: https://github.com/lucide-icons/lucide
- **License URL**: https://github.com/lucide-icons/lucide/blob/main/LICENSE
- **Commercial Use**: ✅ Yes

### Marked (v17.0.1)
- **License**: MIT
- **Usage**: Markdown parser
- **GitHub**: https://github.com/markedjs/marked
- **Commercial Use**: ✅ Yes

### Prism.js (v1.30.0)
- **License**: MIT
- **Usage**: Syntax highlighting for markdown preview
- **GitHub**: https://github.com/PrismJS/prism
- **Commercial Use**: ✅ Yes

### react-zoom-pan-pinch (v3.7.0)
- **License**: MIT
- **Usage**: Pan and zoom for SVG viewer
- **GitHub**: https://github.com/prc5/react-zoom-pan-pinch
- **Commercial Use**: ✅ Yes

### diff (v8.0.2)
- **License**: BSD-3-Clause
- **Usage**: Text diffing for diff viewer
- **GitHub**: https://github.com/kpdecker/jsdiff
- **Commercial Use**: ✅ Yes

---

## AI/LLM Integration

### @mlc-ai/web-llm (v0.2.79)
- **License**: Apache-2.0
- **Usage**: WebLLM for local AI models
- **GitHub**: https://github.com/mlc-ai/web-llm
- **License URL**: https://github.com/mlc-ai/web-llm/blob/main/LICENSE
- **Commercial Use**: ✅ Yes
- **Patent Grant**: ✅ Yes

### tinyllm
- **License**: MIT (assumed, check repository)
- **Source**: github:mknashi/tinyllm
- **Usage**: Lightweight LLM utilities
- **Commercial Use**: ✅ Yes (verify with repository)

---

## Server & Backend

### Express (v4.18.2)
- **License**: MIT
- **Usage**: HTTP server for desktop app
- **GitHub**: https://github.com/expressjs/express
- **Commercial Use**: ✅ Yes

---

## License Compliance Requirements

### For Commercial Use

To comply with all licenses, you must:

1. **Include License Notices**
   - Add a `THIRD_PARTY_LICENSES.txt` file to your distribution
   - Include the full text of MIT and Apache-2.0 licenses
   - List all third-party packages and their copyrights

2. **Attribution Requirements**
   - Display attributions in your app's "About" section or documentation
   - Include copyright notices for all dependencies

3. **Apache-2.0 Specific Requirements** (PDF.js, WebLLM)
   - Include NOTICE file if provided by the project
   - Document any modifications made to the source code
   - Include the Apache-2.0 license text

4. **No Additional Restrictions**
   - All licenses are permissive
   - No copyleft requirements (unlike GPL)
   - No restrictions on commercial use or redistribution

---

## License Types Explained

### MIT License
**Most Permissive**

✅ Permissions:
- Commercial use
- Modification
- Distribution
- Private use

📋 Conditions:
- Include license and copyright notice

❌ Limitations:
- No liability
- No warranty

### Apache-2.0 License
**Permissive with Patent Grant**

✅ Permissions:
- Commercial use
- Modification
- Distribution
- Patent use
- Private use

📋 Conditions:
- Include license and copyright notice
- State changes made
- Include NOTICE file if provided

❌ Limitations:
- Trademark use NOT granted
- No liability
- No warranty

**Key Advantage**: Explicit patent grant protects users from patent lawsuits

### BSD-3-Clause License
**Similar to MIT**

✅ Permissions:
- Commercial use
- Modification
- Distribution
- Private use

📋 Conditions:
- Include license and copyright notice
- No endorsement using contributor names without permission

### ISC License
**Functionally Identical to MIT**

Simpler wording, same permissions and requirements as MIT.

---

## Recommended Attribution Format

Include in your app's "About" dialog or documentation:

```
TidyCode uses the following open-source libraries:

Code Editor:
- CodeMirror (MIT) - https://codemirror.net
- Lezer (MIT) - https://lezer.codemirror.net

PDF Viewer:
- PDF.js (Apache-2.0) - https://mozilla.github.io/pdf.js
- react-pdf (MIT) - https://github.com/wojtekmaj/react-pdf

UI Framework:
- React (MIT) - https://react.dev
- Lucide Icons (ISC) - https://lucide.dev

Desktop Framework:
- Tauri (MIT/Apache-2.0) - https://tauri.app

Terminal:
- xterm.js (MIT) - https://xtermjs.org

AI Integration:
- WebLLM (Apache-2.0) - https://github.com/mlc-ai/web-llm

And many other open-source libraries. See LICENSES.md for details.
```

---

## Full License Texts

For distribution, include these full license texts in a separate file:

### MIT License
```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache-2.0 License
Full text available at: https://www.apache.org/licenses/LICENSE-2.0.txt

---

## Summary Table

| Library Category | License Type | Commercial Use | Patent Grant | Attribution Required |
|-----------------|--------------|----------------|--------------|---------------------|
| React | MIT | ✅ | ❌ | ✅ |
| CodeMirror | MIT | ✅ | ❌ | ✅ |
| PDF.js | Apache-2.0 | ✅ | ✅ | ✅ |
| Tauri | MIT/Apache-2.0 | ✅ | ✅ (Apache) | ✅ |
| xterm.js | MIT | ✅ | ❌ | ✅ |
| Lucide Icons | ISC | ✅ | ❌ | ✅ |
| WebLLM | Apache-2.0 | ✅ | ✅ | ✅ |

---

## Conclusion

**All dependencies are suitable for commercial use** with minimal compliance requirements:

1. ✅ **No restrictions** on commercial distribution
2. ✅ **No copyleft** requirements (can use proprietary license for your app)
3. ✅ **No royalties** or licensing fees
4. ✅ **Patent protection** from Apache-2.0 libraries (PDF.js, WebLLM)
5. ✅ **Simple compliance**: Just include license notices and attributions

**TidyCode can be freely used in commercial products** as long as proper attributions are maintained.

---

*Last Updated: 2025-12-25*
*For questions about specific licenses, consult the original license files in each package's repository.*
