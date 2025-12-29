import { type Plugin } from 'vite';
import type { InputOption } from 'rollup';
import { type ElectronOptions } from '.';
export interface ElectronSimpleOptions {
    main: ElectronOptions;
    preload?: Omit<ElectronOptions, 'entry'> & {
        /**
         * Shortcut of `build.rollupOptions.input`.
         *
         * Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
         */
        input: InputOption;
    };
    /**
     * Support use Node.js API in Electron-Renderer
     * @see https://github.com/electron-vite/vite-plugin-electron-renderer
     */
    renderer?: import('vite-plugin-electron-renderer').RendererOptions;
}
export default function electronSimple(options: ElectronSimpleOptions): Promise<Plugin[]>;
