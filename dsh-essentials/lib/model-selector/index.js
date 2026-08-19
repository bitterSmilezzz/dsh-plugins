//#region src/index.ts
/**
* dsh-model-selector — node half.
*
* Pure UI plugin: the empty apply exists so the plugin appears in the host
* Loader (and its `dsh.client` declaration is scanned into the browser
* roster); the browser half ships via `exports["./client"]`.
*/
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
//#endregion
export { apply };
