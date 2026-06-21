// Ambient module for `*.css` imports.
//
// The content-script overlay surfaces (toast / prompt) inline their styles into a
// Shadow DOM root rather than fetching a stylesheet — zero runtime fetch and zero
// `web_accessible_resources` exposure in the hostile page runtime. esbuild's
// `text` loader (configured for the content/popup build in `scripts/build.mjs`)
// turns a `.css` import into the file's string contents; this declaration lets
// TypeScript type that default export as a string.
declare module "*.css" {
  const css: string;
  export default css;
}
