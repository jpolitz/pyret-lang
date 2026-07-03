General:

Check npm build against TS
Check VScode filesystem against TS
Thunked $name methods for consistency may not be needed (flatten to fields)
Type synonyms for OptionOf for T | undefined
Inconsistencies between constructor use (e.g. CCPFile uses new, CS.ok uses the function wrapper)
Maybe an optimization - unthunk uri() on Locator
Use a never-argument to mimick "no cases matched" statically (e.g. in if/else translations of cases with if-splitting)
Eliminate exports when possible (it mirrors provide *, but we don't actually need everything)
Search generated code for as-casts to check for bad typing
Search generated code for any-types to check for bad typing


cli-module-loader:

Check if toRepr's else case (JSON.stringify) is reachable in cli-module-loader
Why no _equals on the locators made in getCached in cli-module-loader?
Why is there a new field compiledReadOnlyDirs on the CLIContext? Because we forgot it...
CL.CompiledProgram vs a record type on export function compile
never vs. void return types (handleCompilationErrors/propagateExit)
Why is the type of trace any in onCompile?
LOL "standalone" key in stats. That's correctly copied our bad code