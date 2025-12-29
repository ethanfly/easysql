import type { Plugin as VitePlugin } from 'vite';
/** Electron Renderer process code snippets */
export declare const electron: string;
export interface RendererOptions {
    /**
     * Explicitly tell Vite how to load modules, which is very useful for C/C++ and `esm` modules
     *
     * - `type.cjs` just wraps esm-interop
     * - `type.esm` pre-bundle to `cjs` and wraps esm-interop
     *
     * @experimental
     */
    resolve?: {
        [module: string]: {
            type: 'cjs' | 'esm';
            /** Full custom how to pre-bundle */
            build?: (args: {
                cjs: (module: string) => Promise<string>;
                esm: (module: string, buildOptions?: import('esbuild').BuildOptions) => Promise<string>;
            }) => Promise<string>;
        };
    };
}
export default function renderer(options?: RendererOptions): VitePlugin;
