# code.pyret.org

The server and client for the code.pyret.org web service. It lives in the
Pyret monorepo and builds against the sibling `lang/` directory (the compiler
and standard libraries).

## Simple Configuration

Configuration is controlled through a file called `.env` in the base
directory.  This jives with how Heroku manages configuration variables;
everything in `.env` is just an environment variable if you really want to
manage things yourself, but using Heroku tools makes sure you run like things
do in production.

First, get the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli).

Then, copy `.env.example` to `.env`.  If all you want to do is run Pyret code
and test out the REPL, you only need to edit a few variables.  If you want to
use the standalone pyret that comes with the checkout, you can just set

```
PYRET="http://localhost:4999/js/cpo-main.jarr"
```

Then set up the link to the compiler and build (this is what CI does in
`.github/workflows/code.pyret.org-test.yml`):

```
$ ln -s ../lang pyret
$ (cd ../lang && npm install && make phaseA-deps)
$ npm ci --ignore-scripts
$ npm run build
```

(A plain `npm install` also works in place of `npm ci --ignore-scripts`; its
postinstall runs webpack and `make web` for you.)

To run the server (you can let it running in a separate tab --
it doesn't need to be terminated across builds), run:

```
$ npm start
```

The editor will be served from `http://localhost:4999/editor`.

If you edit JavaScript or HTML files in `src/web`, run

```
$ npm run build
```

and then refresh the page.

## Running with the TypeScript compiler (experimental)

CPO can also run on the TypeScript port of the Pyret compiler
(`pyret/src/ts-compiler`), compiled in the page exactly like the stock
compiler. This is strictly additive: the default build and behavior are
unchanged.

Build the parallel artifacts (in addition to the normal build):

```
$ make web-ts
```

This produces `build/web/js/ts-compiler.js` (a browserify bundle of the
TS compiler, exposing the `PyretTSCompiler` global) and
`build/web/js/cpo-main-ts.jarr` (the same editor UI and builtin modules
as `cpo-main.jarr`, minus the Pyret-hosted compiler modules, with the
TS-compiler glue from `src/web/js/cpo-main-ts.js` and
`src/web/js/ts-compiler-lib.js`).

Select the compiler at page startup:

- per page load: open `/editor?compiler=ts` (or `?compiler=pyret`);
- server-wide default: set `CPO_COMPILER=ts` in the environment (see
  `PYRET_TS` / `PYRET_TS_COMPILER` in `src/server.js` for overriding the
  artifact URLs).

Execution, check results, and runtime errors go through the same runtime,
realm, and UI code as the stock build; parse errors are re-raised as the
same Pyret exceptions, and compile errors render through
`builtin://error-display` values bridged from the TS compiler's error
structures. The whole mocha suite passes in both configurations (run it
with `CPO_COMPILER=ts` set on the server for the TS flavor). Known
limits: `my-gdrive`/`shared-gdrive`/`gdrive-js` imports are not yet
supported with the TS compiler (url/url-file imports are), and very long
programs (beyond roughly 5000 statements) can still exhaust the browser's
fixed JS stack during compilation.

## Configuration with Google Auth and Storage

In order to have share links, saving, and other docs-related functionality
work, you need to add to your `.env` a Google client secret, a client ID, a
browser API key, and a server API key.  You'll copy
`.env.example` to `.env`, and populate several from your dashboard at Google.

At https://console.developers.google.com/project, make a project, then:

- For `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, which are used for
  authenticating users:

       Credentials -> Create Credentials -> OAuth Client Id

  For development, you should set the javascript origins to
  `http://localhost:4999` and the redirect URI to
  `http://localhost:4999/oauth2callback`.

- For `GOOGLE_API_KEY`, which is used in the browser to make certain public
  requests when users are not logged in yet:

       Credentials -> Create Credentials -> API Key -> Browser Key

  Again, you should use `http://localhost:4999` as the referer for development.


- Add the Google Drive API to your project and include the Google Drive API
  Scopes in your OAuth consent screen.

- For Google accounts to work locally, you'll also need to run a local Redis instance
  and put its connection url into the `REDISCLOUD_URL` variable in `.env `

## Testing

All tests for this app live in the top-level `browser-test/` directory: the
five-environment suite that drives the editor in cpo/embed/vscode contexts,
and the editor's Selenium/mocha corpus in `browser-test/cpo/` (which moved
there from this directory — see `browser-test/cpo/test/README.md`).

With this app built, the quickest way to run the mocha suites is from
`browser-test/`, which builds prerequisites and starts the server itself:

```
$ cd ../browser-test && make cpo-mocha
```

Selenium needs a
[chromedriver](https://developer.chrome.com/docs/chromedriver/) matching your
Chrome; either put one on your `PATH` or point `CHROMEDRIVER_BINARY` at one
(and `GOOGLE_CHROME_BINARY` at the browser), which is how CI wires up a
matched chrome-for-testing pair.

## Setting up your own remote version of code.pyret.org with Heroku:

If you are doing development on code.pyret.org, it can be useful to run it on a remote server (for sharing purposes, etc.). Heroku allows us to do this easily.

### Before you begin:

Follow the instructions above to get it running locally.

The Heroku getting started guide is helpful, but it will be easier if you set things up in the order below
https://devcenter.heroku.com/articles/getting-started-with-nodejs

### To run remotely:
1. Make an account at http://heroku.com/ and from a terminal run `heroku login`
2. Navigate to this directory in a terminal.
3.	Run `heroku create <appname>`. This will create an app on Heroku linked to your local repository.
4.	Set the config variables found in `.env` (or `.env.example`) on Heroku. You can enter them using `heroku config:set NAME1=VALUE1 NAME2=VALUE2` or in the online control panel. There are 3 config variables you should pay special attention to:
  - add key `GIT_BRANCH`, value should be your branch name
  - add key `GIT_REV`, value should be your branch name
  - change `PYRET` from local host to a URL that points to cpo-main.jarr from build folder. Make sure URL ends in js instead of jarr.
5.	Add a Redis Cloud database using `heroku addons:add rediscloud` or at addons.heroku.com. You will likely have to verify first (enter a credit card), but you shouldn’t actually be charged for the most basic level (but check for yourself!).
6.	Now, run

        $ git push heroku <localbranch>:master
        $ heroku ps:scale web=1

7.	Now run `heroku open` or visit appname.herokuapp.com.

8.  Tips for redeploy: if you don't see a successful build under heroku webiste's activity tab, but get "everything is up-to-date" when you run `git push heroku <localbranch>:master`, or your build doesn't look up-to-date, you can do an empty commit: `git commit --allow-empty -m "force deploy"`

## Production Deployment

Deployment of the real code.pyret.org is managed outside this repository (see
the note in the repo root README).
