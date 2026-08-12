PORT=5150

serve:
	raco pollen start . ${PORT} &
	open http://localhost:${PORT}/index.ptree

clean:  # clears the Pollen cache — often the culprit when reloading a file doesn't show a change
	raco pollen reset

ps:
	ps -ef | grep ${PORT} | grep pollen | grep -v grep

# index.html.pm loads these three from site/js/
site/js/codemirror.js: node_modules/codemirror/lib/codemirror.js
	mkdir -p site/js/
	cp $< $@

site/js/pyret.js: node_modules/pyret-codemirror-mode/mode/pyret.js
	mkdir -p site/js/
	cp $< $@

site/js/runmode.js: node_modules/codemirror/addon/runmode/runmode.js
	mkdir -p site/js/
	cp $< $@

site-js: site/js/codemirror.js site/js/pyret.js site/js/runmode.js

# The docs build from the sibling docs/ directory in this repository.
# site/docs/horizon is kept alongside site/docs/latest because published
# links to pyret.org/docs/horizon/ predate the monorepo (when the docs
# tracked the pyret-lang horizon branch); both now hold the same build.
../docs/build/docs:
	$(MAKE) -C ../docs

docs/horizon: ../docs/build/docs
	mkdir -p site/docs/
	cp -r ../docs/build/docs site/docs/horizon

docs/latest: ../docs/build/docs
	mkdir -p site/docs/
	cp -r ../docs/build/docs site/docs/latest

site/docs/index.html:
	mkdir -p site/docs/
	cp src/docs-redirect.html site/docs/index.html

docs: site/docs/index.html docs/horizon docs/latest
