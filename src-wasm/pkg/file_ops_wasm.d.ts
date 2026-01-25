/* tslint:disable */
/* eslint-disable */

/**
 * Create a new file buffer from content
 * Returns a unique file ID that can be used to reference this buffer
 */
export function create_file_buffer(content: Uint8Array): number;

/**
 * Format JSON content with specified indentation
 */
export function format_json(file_id: number, indent: number): string;

/**
 * Free a file buffer from memory
 * Call this when closing a tab to prevent memory leaks
 */
export function free_file_buffer(file_id: number): void;

/**
 * Get full file content as string
 * This is used when saving the file - content is stored in WASM, not React state
 */
export function get_content(file_id: number): string;

/**
 * Get file metadata
 */
export function get_file_info(file_id: number): any;

/**
 * Get a range of lines
 * Lines are 1-indexed (line 1 is the first line)
 */
export function get_line_range(file_id: number, start_line: number, end_line: number): string;

/**
 * Get memory usage statistics
 */
export function get_memory_stats(): any;

/**
 * Initialize WASM module (called once on load)
 */
export function init(): void;

/**
 * Search file for pattern (supports regex)
 * Returns up to max_results matches
 */
export function search_file(file_id: number, pattern: string, max_results: number): any;

/**
 * Validate JSON content of a file
 */
export function validate_json(file_id: number): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly create_file_buffer: (a: number, b: number) => [number, number, number];
  readonly format_json: (a: number, b: number) => [number, number, number, number];
  readonly free_file_buffer: (a: number) => [number, number];
  readonly get_content: (a: number) => [number, number, number, number];
  readonly get_file_info: (a: number) => [number, number, number];
  readonly get_line_range: (a: number, b: number, c: number) => [number, number, number, number];
  readonly get_memory_stats: () => [number, number, number];
  readonly search_file: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly validate_json: (a: number) => [number, number, number];
  readonly init: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
