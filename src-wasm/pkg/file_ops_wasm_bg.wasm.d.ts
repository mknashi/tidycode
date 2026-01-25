/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const create_file_buffer: (a: number, b: number) => [number, number, number];
export const format_json: (a: number, b: number) => [number, number, number, number];
export const free_file_buffer: (a: number) => [number, number];
export const get_content: (a: number) => [number, number, number, number];
export const get_file_info: (a: number) => [number, number, number];
export const get_line_range: (a: number, b: number, c: number) => [number, number, number, number];
export const get_memory_stats: () => [number, number, number];
export const search_file: (a: number, b: number, c: number, d: number) => [number, number, number];
export const validate_json: (a: number) => [number, number, number];
export const init: () => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
