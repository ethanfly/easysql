import type { Plugin } from 'vite';
export interface NotBundleOptions {
    filter?: (id: string) => void | false;
}
/**
 * @see https://github.com/vitejs/vite/blob/v4.4.7/packages/vite/src/node/utils.ts#L140
 */
export declare const bareImportRE: RegExp;
/**
 * During dev, we exclude the `cjs` npm-pkg from bundle, mush like Vite :)
 */
export declare function notBundle(options?: NotBundleOptions): Plugin;
