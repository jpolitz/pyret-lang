/*
  Shared by the single-executable entries (pyret-sea.ts, pyret-cli.ts).

  Embeds the AMD support-module sources the compiler reads at runtime (baked
  into the binary by bun's `type: "text"` imports) and registers them through
  the compiler's own `registerModuleSource` / `setAmdLoaderSource` hooks, so
  amdRequire and standalone assembly never touch the filesystem for them.
*/
import jsNumbersSrc from '../../../build/ts-compiler/js/js-numbers.js' with { type: 'text' };
import typeUtilSrc from '../../../build/ts-compiler/js/type-util.js' with { type: 'text' };
import tokenizerSrc from '../../../build/ts-compiler/js/pyret-tokenizer.js' with { type: 'text' };
import parserSrc from '../../../build/ts-compiler/js/pyret-parser.js' with { type: 'text' };
import jglrSrc from '../../../build/ts-compiler/js/jglr.js' with { type: 'text' };
import rnglrSrc from '../../../build/ts-compiler/js/rnglr.js' with { type: 'text' };
import cyclicJsonSrc from '../../../build/ts-compiler/js/cyclicJSON.js' with { type: 'text' };
import amdLoaderSrc from '../../../build/ts-compiler/js/amd_loader.js' with { type: 'text' };

import { registerModuleSource } from '../src/interop/amd';
import { setAmdLoaderSource } from '../src/make-standalone';

export function registerEmbeddedAssets(): void {
  registerModuleSource('pyret-base/js/js-numbers', jsNumbersSrc as unknown as string);
  registerModuleSource('pyret-base/js/type-util', typeUtilSrc as unknown as string);
  registerModuleSource('pyret-base/js/pyret-tokenizer', tokenizerSrc as unknown as string);
  registerModuleSource('pyret-base/js/pyret-parser', parserSrc as unknown as string);
  registerModuleSource('jglr/jglr', jglrSrc as unknown as string);
  registerModuleSource('jglr/rnglr', rnglrSrc as unknown as string);
  registerModuleSource('jglr/cyclicJSON', cyclicJsonSrc as unknown as string);
  setAmdLoaderSource(amdLoaderSrc as unknown as string);
}
