# Diff Viewer Enhancement Plan

## Executive Summary
This document outlines a comprehensive plan to enhance the Diff Viewer functionality in Tidy Code to improve developer productivity and provide better user experience. The current implementation has basic diff capabilities but lacks advanced features that developers need for effective code review and comparison workflows.

## Current State Analysis

### Existing Features
- ✅ Side-by-side diff view with Myers diff algorithm
- ✅ File upload for both panels
- ✅ Clipboard paste support
- ✅ Manual text input via textarea
- ✅ Synchronized scrolling between left/right panels
- ✅ Line-by-line comparison with color coding (added/deleted/modified)
- ✅ Merge view with manual editing
- ✅ Accept changes from either side
- ✅ Copy and save merged result
- ✅ Integration with active tab content

### Current Limitations
- ❌ No inline diff mode (character-level differences)
- ❌ No syntax highlighting in diff view
- ❌ No search/find within diff
- ❌ Limited navigation (no jump to next/previous change)
- ❌ No conflict resolution UI for three-way merges
- ❌ No diff statistics (hunks, context lines)
- ❌ No customizable context lines
- ❌ No unified diff view option
- ❌ No keyboard shortcuts
- ❌ No undo/redo in merge view
- ❌ No git integration
- ❌ No support for diffing multiple files
- ❌ Simple diff algorithm may miss optimal diffs

## Enhancement Phases

### Phase 1: Core Diff Improvements (High Priority)

#### 1.1 Inline/Character-Level Diff
**Goal**: Show character-level differences within modified lines

**Implementation**:
- Add character-level diff algorithm (e.g., word-diff or character-diff)
- Highlight changed portions within lines with different background color
- Toggle between line-level and character-level view
- Use lighter shade for character changes within modified lines

**Benefits**:
- Easier to spot exact changes in long lines
- Better for code review workflows
- Reduces cognitive load

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add `computeInlineDiff()` function
- Add state for inline diff mode toggle

**Estimated complexity**: Medium

#### 1.2 Syntax Highlighting in Diff View
**Goal**: Apply syntax highlighting to code being compared

**Implementation**:
- Integrate CodeMirror or similar syntax highlighter
- Auto-detect language from file extension or content
- Apply highlighting while preserving diff colors
- Support all languages already supported in main editor

**Benefits**:
- Easier to read code diffs
- Better developer experience
- Professional appearance

**Files to modify**:
- `src/components/DiffViewer.jsx` - Replace plain text rendering with syntax-highlighted rendering
- May need new component: `SyntaxHighlightedDiffLine.jsx`

**Dependencies**:
- CodeMirror (already in project)
- Language detection library or reuse existing logic

**Estimated complexity**: High

#### 1.3 Navigation Controls
**Goal**: Quick navigation between changes

**Implementation**:
- Add "Previous Change" and "Next Change" buttons
- Add "Jump to Line" input
- Keyboard shortcuts:
  - `Alt+↑` / `Alt+↓` - Previous/Next change
  - `Ctrl+G` - Jump to line
- Visual indicator showing current change position (e.g., "3 of 15 changes")
- Auto-scroll to selected change

**Benefits**:
- Faster code review
- Easy to track progress through diff
- Better for large files

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add navigation state and functions
- Add toolbar buttons for navigation

**Estimated complexity**: Low-Medium

#### 1.4 Search Within Diff
**Goal**: Find specific text in either side of diff

**Implementation**:
- Add search bar with case-sensitive toggle
- Highlight all matches
- Navigate between search results
- Show match count
- Keyboard shortcut: `Ctrl+F`

**Benefits**:
- Quick location of specific changes
- Essential for large diffs
- Standard feature in all diff tools

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add search UI and logic
- Integrate with existing diff rendering

**Estimated complexity**: Medium

### Phase 2: Advanced Merge Features (Medium Priority)

#### 2.1 Improved Merge UI
**Goal**: Better conflict resolution and merge controls

**Implementation**:
- Add conflict markers view (<<<<<<, =======, >>>>>>>)
- Visual conflict resolution panel
- Accept entire hunks (not just single lines)
- "Accept Both" option for conflicts
- Undo/Redo stack for merge operations
- Show merge status (conflicts remaining, resolved)

**Benefits**:
- Professional git-like merge workflow
- Reduces errors in conflict resolution
- Better for team collaboration

**Files to modify**:
- `src/components/DiffViewer.jsx` - Major refactor of merge logic
- Add new component: `ConflictResolutionPanel.jsx`

**Estimated complexity**: High

#### 2.2 Three-Way Merge Support
**Goal**: Support base-left-right three-way merge

**Implementation**:
- Add third panel for "base" version
- Show changes from base to both sides
- Smart conflict detection
- Option to load from git (base = merge-base)

**Benefits**:
- Essential for git merge workflows
- Better conflict understanding
- Industry-standard approach

**Files to modify**:
- `src/components/DiffViewer.jsx` - Major restructure for 3-panel layout
- New diff algorithm for three-way

**Estimated complexity**: Very High

#### 2.3 Diff Context Control
**Goal**: Control how much context to show around changes

**Implementation**:
- Add context line slider (0-20 lines)
- "Expand" buttons to show more context
- "Collapse unchanged" to hide identical sections
- Persist user preference

**Benefits**:
- Cleaner view for large files
- Focus on actual changes
- Customizable to user preference

**Files to modify**:
- `src/components/DiffViewer.jsx` - Modify diff rendering logic
- Add settings state

**Estimated complexity**: Medium

### Phase 3: Integration & Workflows (Medium Priority)

#### 3.1 Git Integration
**Goal**: Compare against git versions

**Implementation**:
- "Compare with HEAD" option
- "Compare with branch" option
- "Compare with commit" option
- Show git status (staged, unstaged, untracked)
- Only available in desktop mode (Tauri)

**Benefits**:
- Seamless git workflow
- No need to switch tools
- Desktop feature differentiator

**Files to modify**:
- New file: `src/services/GitService.js`
- `src/components/DiffViewer.jsx` - Add git integration UI
- Desktop-only feature flag

**Dependencies**:
- Tauri Command API
- Git binary on system

**Estimated complexity**: High

#### 3.2 Multi-File Diff
**Goal**: Compare and navigate between multiple files

**Implementation**:
- File tree sidebar showing all changed files
- Click to switch between files
- Show summary (files changed, additions, deletions)
- Batch operations (accept all left, accept all right)

**Benefits**:
- Essential for PR/MR review
- Professional code review tool
- Competitive feature

**Files to modify**:
- Major refactor of `DiffViewer.jsx`
- New component: `MultiFileDiffViewer.jsx`
- New component: `DiffFileTree.jsx`

**Estimated complexity**: Very High

#### 3.3 Diff Export/Import
**Goal**: Save and load diff sessions

**Implementation**:
- Export to standard formats:
  - Unified diff (.diff, .patch)
  - Git patch format
  - JSON (for full state restore)
- Import patch files
- Apply patches to active file

**Benefits**:
- Share diffs with team
- Archive for reference
- Integration with other tools

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add export/import functions
- New utility: `src/utils/diffFormats.js`

**Estimated complexity**: Medium

### Phase 4: UX & Performance (Low-Medium Priority)

#### 4.1 Unified Diff View
**Goal**: Provide traditional unified diff format option

**Implementation**:
- Toggle between side-by-side and unified view
- Single column with +/- line prefixes
- Maintains syntax highlighting
- User preference persisted

**Benefits**:
- Familiar to git users
- Better for narrow screens
- Space-efficient

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add unified rendering mode
- New component: `UnifiedDiffView.jsx`

**Estimated complexity**: Medium

#### 4.2 Performance Optimization
**Goal**: Handle large files efficiently

**Implementation**:
- Virtual scrolling for large diffs (1000+ lines)
- Lazy computation of character-level diffs
- Debounced search
- Worker thread for diff computation
- Progressive rendering

**Benefits**:
- Smooth performance with large files
- No UI freezing
- Professional-grade tool

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add virtualization
- New worker: `src/workers/diffWorker.js`

**Dependencies**:
- `react-window` or `react-virtual` for virtualization

**Estimated complexity**: High

#### 4.3 Keyboard Shortcuts & Accessibility
**Goal**: Full keyboard navigation and screen reader support

**Implementation**:
- Comprehensive keyboard shortcuts
- Shortcut help overlay (press `?`)
- ARIA labels for all interactive elements
- Focus management
- Screen reader announcements for changes

**Keyboard shortcuts**:
- `?` - Show help
- `Ctrl+F` - Search
- `Alt+↑/↓` - Previous/Next change
- `Ctrl+G` - Jump to line
- `Ctrl+[` / `Ctrl+]` - Switch between panels
- `Space` - Accept change
- `Escape` - Close diff viewer

**Benefits**:
- Accessibility compliance
- Power user productivity
- Professional UX

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add keyboard event handlers
- New component: `KeyboardShortcutsHelp.jsx`

**Estimated complexity**: Medium

#### 4.4 Diff Minimap
**Goal**: Visual overview of entire diff

**Implementation**:
- Minimap on right side showing all changes
- Color-coded blocks (green=added, red=deleted, yellow=modified)
- Click to jump to location
- Visible viewport indicator
- Similar to VSCode minimap

**Benefits**:
- Overview of change distribution
- Quick navigation
- Modern editor feature

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add minimap panel
- New component: `DiffMinimap.jsx`

**Estimated complexity**: Medium-High

### Phase 5: Advanced Features (Low Priority)

#### 5.1 Intelligent Diff Algorithms
**Goal**: Better diff quality with advanced algorithms

**Implementation**:
- Replace simple Myers with full Myers algorithm
- Add Patience diff algorithm option
- Add Histogram diff algorithm option
- Word-aware diff (respect word boundaries)
- Whitespace handling options (ignore, show, collapse)

**Benefits**:
- More accurate diffs
- Matches git diff output
- Professional-grade quality

**Files to modify**:
- `src/components/DiffViewer.jsx` - Replace diff algorithm
- New file: `src/utils/diffAlgorithms.js`

**Dependencies**:
- Consider using `diff` npm package (30KB)

**Estimated complexity**: Medium-High

#### 5.2 Diff Templates & Presets
**Goal**: Save common diff configurations

**Implementation**:
- Save current settings as template
- Quick-load templates
- Built-in templates (code review, merge conflict, documentation)
- Share templates via export/import

**Benefits**:
- Faster workflow
- Consistency across team
- Professional tool feature

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add template management
- Settings storage integration

**Estimated complexity**: Low-Medium

#### 5.3 AI-Powered Features
**Goal**: Use AI to enhance diff understanding

**Implementation**:
- "Explain this change" - AI describes what changed and why
- "Suggest merge" - AI suggests conflict resolution
- "Generate commit message" from diff
- Semantic diff (understand code meaning, not just text)

**Benefits**:
- Cutting-edge feature
- Time-saving for developers
- Unique selling point

**Files to modify**:
- `src/components/DiffViewer.jsx` - Add AI buttons
- Integration with existing AI service
- `src/services/AIService.js` - Add diff-specific prompts

**Estimated complexity**: Medium (UI) + High (AI quality)

#### 5.4 Collaborative Features
**Goal**: Real-time collaboration on diffs

**Implementation**:
- Share diff session via URL
- Multi-user cursor tracking
- Comments on specific lines
- Review status tracking

**Benefits**:
- Team collaboration
- Remote code review
- Professional team tool

**Files to modify**:
- Major architecture change
- Backend service needed (WebRTC or WebSocket)

**Estimated complexity**: Very High

## Implementation Priorities

### Must-Have (Ship in v2.0)
1. Inline/Character-level diff (1.1)
2. Navigation controls (1.3)
3. Search within diff (1.4)
4. Fix scrollbar (COMPLETED)
5. Keyboard shortcuts (4.3)

### Should-Have (Ship in v2.1)
6. Syntax highlighting (1.2)
7. Improved merge UI with undo/redo (2.1)
8. Diff context control (2.3)
9. Unified diff view (4.1)
10. Export to patch format (3.3)

### Nice-to-Have (Ship in v2.2+)
11. Three-way merge (2.2)
12. Performance optimization for large files (4.2)
13. Git integration (3.1 - desktop only)
14. Diff minimap (4.4)
15. Better diff algorithms (5.1)

### Future Exploration
16. Multi-file diff (3.2)
17. AI-powered features (5.3)
18. Diff templates (5.2)
19. Collaborative features (5.4)

## Technical Architecture

### Component Structure
```
DiffViewer/
├── DiffViewer.jsx (main container)
├── components/
│   ├── DiffPanel.jsx (reusable diff panel)
│   ├── DiffLine.jsx (single line with syntax highlighting)
│   ├── MergeView.jsx (merge result panel)
│   ├── ConflictResolutionPanel.jsx (conflict UI)
│   ├── DiffMinimap.jsx (visual overview)
│   ├── DiffNavigator.jsx (prev/next controls)
│   ├── DiffSearch.jsx (search UI)
│   ├── UnifiedDiffView.jsx (unified format)
│   ├── KeyboardShortcutsHelp.jsx (help overlay)
│   └── DiffFileTree.jsx (multi-file support)
├── utils/
│   ├── diffAlgorithms.js (Myers, Patience, Histogram)
│   ├── inlineDiff.js (character-level diff)
│   ├── diffFormats.js (import/export)
│   └── syntaxHighlight.js (language-aware highlighting)
└── workers/
    └── diffWorker.js (background computation)
```

### State Management
Consider using Zustand or Context API for:
- Diff settings/preferences
- Current file(s) being compared
- Merge state with undo/redo
- Search state
- Navigation state

### Performance Considerations
- Virtual scrolling for 500+ line diffs
- Web Worker for diffs > 10,000 lines
- Memoization for expensive computations
- Lazy loading of syntax highlighting
- Debounced search (300ms)
- Progressive rendering for multi-file diffs

### Accessibility
- All controls keyboard accessible
- ARIA landmarks and labels
- Focus trap in modal
- Screen reader announcements
- Sufficient color contrast (WCAG AA)
- Customizable color schemes

## Success Metrics

### User Experience
- Time to review a diff: < 30 seconds for typical PR
- Navigation efficiency: < 2 clicks to any change
- Search response time: < 100ms
- Zero performance issues for files < 5000 lines

### Feature Adoption
- 80%+ users use character-level diff
- 60%+ users use keyboard shortcuts
- 90%+ users find search within 3 tries
- 50%+ desktop users use git integration

### Quality
- Zero accessibility violations (aXe)
- Lighthouse score > 90
- Bundle size increase < 50KB
- Memory usage < 100MB for large diffs

## Development Roadmap

### Sprint 1 (2 weeks) - Core Navigation
- Character-level diff (1.1)
- Navigation controls (1.3)
- Keyboard shortcuts foundation (4.3)

### Sprint 2 (2 weeks) - Search & UX
- Search within diff (1.4)
- Complete keyboard shortcuts (4.3)
- Accessibility improvements

### Sprint 3 (2 weeks) - Syntax Highlighting
- Integrate syntax highlighting (1.2)
- Language detection
- Performance testing

### Sprint 4 (2 weeks) - Merge Improvements
- Improved merge UI (2.1)
- Undo/redo in merge
- Context control (2.3)

### Sprint 5 (1 week) - Views & Export
- Unified diff view (4.1)
- Export to patch (3.3)
- Testing & bug fixes

### Sprint 6+ (Future)
- Advanced features based on user feedback
- Git integration (desktop)
- AI features
- Multi-file diff

## Migration Strategy

### Backward Compatibility
- Existing API remains unchanged
- New features opt-in via settings
- Default behavior matches current implementation
- Smooth upgrade path

### Breaking Changes
None planned for Phase 1-2. Phase 3+ may require:
- Major version bump for three-way merge
- API changes for multi-file diff
- State structure changes (use migrations)

## Testing Strategy

### Unit Tests
- Diff algorithm correctness
- Character-level diff accuracy
- Search functionality
- Navigation logic
- Export/import formats

### Integration Tests
- Full diff workflow
- Merge workflow
- Git integration (desktop)
- Multi-file navigation

### E2E Tests
- User journeys (review PR, resolve conflict, etc.)
- Keyboard navigation flows
- Accessibility compliance

### Performance Tests
- Large file benchmarks (10K, 50K, 100K lines)
- Memory leak detection
- Render performance
- Search performance

## Risks & Mitigation

### Risk: Performance with Large Files
**Mitigation**: Virtual scrolling, Web Workers, progressive rendering

### Risk: Bundle Size Growth
**Mitigation**: Code splitting, lazy loading, tree shaking, use lightweight libraries

### Risk: Complexity Creep
**Mitigation**: Phased approach, MVP first, user feedback driven

### Risk: Accessibility Regression
**Mitigation**: Automated testing, manual testing, regular audits

### Risk: Browser Compatibility
**Mitigation**: Test on all major browsers, polyfills where needed, graceful degradation

## Conclusion

This enhancement plan transforms the diff viewer from a basic comparison tool into a professional-grade code review and merge tool suitable for serious development workflows. By focusing on developer productivity, we deliver features that save time and reduce errors.

The phased approach ensures steady progress while maintaining stability. Starting with must-have features (character diff, navigation, search) delivers immediate value, while later phases add advanced capabilities.

Success depends on:
1. **User-centric design** - Every feature must solve real pain points
2. **Performance** - Must handle large files smoothly
3. **Accessibility** - Keyboard and screen reader support from day one
4. **Quality** - Thorough testing at every phase

This plan positions Tidy Code's diff viewer as competitive with VSCode, IntelliJ, and dedicated diff tools while maintaining the lightweight, fast character that defines Tidy Code.
