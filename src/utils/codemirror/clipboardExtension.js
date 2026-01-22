/**
 * CodeMirror extension for handling clipboard operations in Tauri desktop app
 * Prevents permission prompts by using Tauri's native clipboard API
 */

import { keymap } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { isDesktop } from '../platform.js';

/**
 * Create clipboard extension that uses Tauri's clipboard in desktop mode
 * @returns {Extension}
 */
export function clipboardExtension() {
  // Only override clipboard behavior in desktop mode
  if (!isDesktop()) {
    return [];
  }

  return keymap.of([
    {
      key: 'Mod-v', // Ctrl+V on Windows/Linux, Cmd+V on Mac
      preventDefault: true,
      run: async (view) => {
        try {
          // Use Tauri's clipboard API (no permission prompt)
          const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
          const text = await readText();

          if (text) {
            // Insert the clipboard text at the current selection
            const transaction = view.state.update(view.state.replaceSelection(text));
            view.dispatch(transaction);
            return true;
          }
        } catch (error) {
          console.error('[CodeMirror] Paste failed:', error);
        }
        return false;
      },
    },
    {
      key: 'Mod-c', // Ctrl+C on Windows/Linux, Cmd+C on Mac
      preventDefault: true,
      run: async (view) => {
        try {
          const selection = view.state.selection.main;
          const text = view.state.sliceDoc(selection.from, selection.to);

          if (text) {
            // Use Tauri's clipboard API (no permission prompt)
            const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
            await writeText(text);
            return true;
          }
        } catch (error) {
          console.error('[CodeMirror] Copy failed:', error);
        }
        return false;
      },
    },
    {
      key: 'Mod-x', // Ctrl+X on Windows/Linux, Cmd+X on Mac
      preventDefault: true,
      run: async (view) => {
        try {
          const selection = view.state.selection.main;
          const text = view.state.sliceDoc(selection.from, selection.to);

          if (text) {
            // Use Tauri's clipboard API (no permission prompt)
            const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
            await writeText(text);

            // Delete the selected text
            const transaction = view.state.update(view.state.replaceSelection(''));
            view.dispatch(transaction);
            return true;
          }
        } catch (error) {
          console.error('[CodeMirror] Cut failed:', error);
        }
        return false;
      },
    },
  ]);
}
