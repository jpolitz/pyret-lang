/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @type WebpackConfig */
const webExtensionConfig = {
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
	target: 'webworker', // extensions run in a webworker context
	entry: {
		'extension': './src/webExtension.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, './dist/web'),
		libraryTarget: 'commonjs',
		devtoolModuleFilenameTemplate: '../../[resource-path]'
	},
	resolve: {
		mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
		extensions: ['.ts', '.js'], // support ts-files and js-files
		alias: {
			// provides alternate implementation for node module and source files
		},
		fallback: {
			// Webpack 5 no longer polyfills Node.js core modules automatically.
			// see https://webpack.js.org/configuration/resolve/#resolvefallback
			// for the list of Node.js core module polyfills.
			'assert': require.resolve('assert'),
			path: require.resolve('path-browserify')
		}
	},
	module: {
		rules: [{
			test: /\.ts$/,
			exclude: /node_modules/,
			use: [{
				loader: 'ts-loader'
			}]
		},
		{
			test: /\.html/,
			type: 'asset/source'
		},
		{
			// The self-contained webview (src/self-contained-webview.js) inlines
			// the CPO editor's shell scripts/styles into the injected HTML so the
			// webview never depends on Open VSX serving them with an executable
			// MIME type (see pyret-parley issue #21). Expose exactly those files
			// (NOT the 37MB cpo-main.jarr.js runtime, which is fetched + inflated
			// in-page) to `require` as source strings rather than parsed modules.
			// Matched by basename: `build` is a symlink, so webpack resolves these
			// to their real path (no stable `build/web/` prefix to key on). The
			// require.context in pyretCPOWebEditor.ts is what scopes WHICH files
			// are pulled in; this rule only sets their type. The extension has no
			// other .css, and these .js basenames are unique to the CPO shell.
			test: /([\\/](vega\.min|vega-tooltip\.min|localSettings|es6-shim|jquery\.min|jquery-ui\.min|editor-misc\.min)\.js|\.css)$/,
			type: 'asset/source'
		}
		]
	},
	plugins: [
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1 // disable chunks by default since web extensions must be a single bundle
		}),
		new webpack.ProvidePlugin({
			process: 'process/browser', // provide a shim for the global `process` variable
		}),
		new CopyPlugin({
			patterns: [
				{
					from: path.resolve(__dirname, "build"),
					to: "./build",
					globOptions: {
						// Ship the gzipped runtime (cpo-main.jarr.gz.js, ~5.6MB) and
						// DROP the uncompressed 37MB cpo-main.jarr.js: the webview
						// fetches the .gz and inflates it in-page with
						// DecompressionStream (issue #21). This also keeps the vsix
						// small and under Open VSX's ~15MB per-file cap.
						// Only cpo-main.jarr.gz.js is fetched (and inflated in-page);
						// drop the uncompressed 37MB bundle and the CPO build's big
						// intermediates (cpo-main.jarr, .jarr.js, .jarr.min).
						ignore: [
							"**/snap/**",
							"**/js/cpo-main.jarr",
							"**/js/cpo-main.jarr.js",
							"**/js/cpo-main.jarr.min",
						],
					},
					// Terser skip this file for minification
					info: { minimized: true },
				},
			]
		})
	],
	externals: {
		'vscode': 'commonjs vscode', // ignored because it doesn't exist
	},
	performance: {
		hints: false
	},
	devtool: 'nosources-source-map', // create a source map that points to the original source file
	infrastructureLogging: {
		level: "log", // enables logging required for problem matchers
	},
};

module.exports = [ webExtensionConfig ];