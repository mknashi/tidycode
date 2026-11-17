// Shared by the editor and its diagnostic/review surfaces.
export const EDITOR_FONT_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
export const getFontSizePixels = size => ({ '2xs': '10px', xs: '12px', sm: '14px', base: '16px' }[size] || '12px');
export const getLineHeightValue = size => ({ '2xs': '1.2', xs: '1.3', sm: '1.4', base: '1.5' }[size] || '1.3');
export const getEditorTypography = size => ({
  fontFamily: EDITOR_FONT_FAMILY,
  fontSize: getFontSizePixels(size),
  lineHeight: getLineHeightValue(size),
});
