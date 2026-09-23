provide *

import either as E
import json as J
import load-lib as L
import pathlib as P
import runtime-lib as RL
import string-dict as SD
import render-error-display as RED
import js-file("server") as S
import file("./cli-module-loader.arr") as CLI
import file("./compile-structs.arr") as CS
import file("./repl.arr") as R
import file("locators/builtin.arr") as B

fun compile(options):
  outfile = cases(Option) options.get("outfile"):
    | some(v) => v
    | none => options.get-value("program") + ".jarr"
  end
  compile-opts = CS.make-default-compile-options(options.get-value("this-pyret-dir"))
  CLI.build-runnable-standalone(
    options.get-value("program"),
    options.get-value("require-config"),
    outfile,
    compile-opts.{
      base-dir: options.get-value("base-dir"),
      this-pyret-dir : options.get-value("this-pyret-dir"),
      check-mode : not(options.get("no-check-mode").or-else(false)),
      type-check : options.get("type-check").or-else(false),
      allow-shadowed : options.get("allow-shadowed").or-else(false),
      collect-all: options.get("collect-all").or-else(false),
      ignore-unbound: options.get("ignore-unbound").or-else(false),
      proper-tail-calls: options.get("improper-tail-calls").or-else(true),
      compiled-cache: options.get("compiled-dir").or-else("./compiled"),
      compiled-read-only: options.get("compiled-read-only").or-else(empty),
      standalone-file: options.get("standalone-file").or-else(compile-opts.standalone-file),
      checks: options.get-value("checks"),
      checks-format: options.get-value("checks-format"),
      display-progress: options.get("display-progress").or-else(true),
      log: options.get("log").or-else(compile-opts.log),
      log-error: options.get("log-error").or-else(compile-opts.log-error),
      deps-file: options.get("deps-file").or-else(compile-opts.deps-file),
      user-annotations: options.get("user-annotations").or-else(compile-opts.user-annotations)
    })
end

fun serve(port, pyret-dir):
  # REPL session state: session-id -> {repl, compile-opts}
  repl-sessions = SD.make-mutable-string-dict()

  # Mutable stdout sink, updated before each interaction so print() output
  # reaches the active connection. Safe because the run queue is sequential.
  var current-send = lam(s): nothing end

  S.make-server(port, lam(msg, send-message) block:
    full = J.read-json(msg).native()
    command = full.get("command").or-else("compile")

    fun log(s, to-clear):
      d = [SD.string-dict: "type", J.j-str("echo-log"), "contents", J.j-str(s)]
      with-clear = cases(Option) to-clear:
        | none => d.set("clear-first", J.j-bool(false))
        | some(n) => d.set("clear-first", J.j-num(n))
      end
      send-message(J.j-obj(with-clear).serialize())
    end
    fun log-err(s):
      d = [SD.string-dict: "type", J.j-str("echo-err"), "contents", J.j-str(s)]
      send-message(J.j-obj(d).serialize())
    end

    if command == "compile":
      block:
        # compileOptions is double-JSON-encoded by the client
        opts = J.read-json(full.get-value("compileOptions")).native()

        when opts.has-key("builtin-js-dir"):
          if is-List(opts.get-value("builtin-js-dir")):
            B.set-builtin-js-dirs(opts.get-value("builtin-js-dir"))
          else:
            B.set-builtin-js-dirs([list: opts.get-value("builtin-js-dir")])
          end
        end
        when opts.has-key("builtin-arr-dir"):
          if is-List(opts.get-value("builtin-arr-dir")):
            B.set-builtin-arr-dirs(opts.get-value("builtin-arr-dir"))
          else:
            B.set-builtin-arr-dirs([list: opts.get-value("builtin-arr-dir")])
          end
        end
        when opts.has-key("allow-builtin-overrides"):
          B.set-allow-builtin-overrides(opts.get-value("allow-builtin-overrides"))
        end

        with-logger = opts.set("log", log)
        with-error = with-logger.set("log-error", log-err)
        with-pyret-dir = with-error.set("this-pyret-dir", pyret-dir)
        with-read-only = with-pyret-dir.set("compiled-read-only",
              link(P.resolve(P.join(pyret-dir, "lib-compiled")), empty))
        with-perilous = if opts.has-key("perilous") and opts.get-value("perilous"):
            with-read-only.set("user-annotations", false)
          else:
            with-read-only
          end
        with-require-config = with-perilous.set("require-config",
          opts.get("require-config").or-else(P.resolve(P.join(pyret-dir, "config.json"))))

        result = run-task(lam():
          compile(with-require-config)
        end)
        cases(E.Either) result block:
          | right(exn) =>
            err-str = RED.display-to-string(exn-unwrap(exn).render-reason(), tostring, empty)
            log-err(err-str + "\n")
            send-message(J.j-obj([SD.string-dict: "type", J.j-str("compile-failure")]).serialize())
          | left(_) =>
            send-message(J.j-obj([SD.string-dict: "type", J.j-str("compile-success")]).serialize())
        end
      end

    else if command == "repl-start":
      block:
        opts = full

        when opts.has-key("builtin-js-dir"):
          if is-List(opts.get-value("builtin-js-dir")):
            B.set-builtin-js-dirs(opts.get-value("builtin-js-dir"))
          else:
            B.set-builtin-js-dirs([list: opts.get-value("builtin-js-dir")])
          end
        end
        when opts.has-key("builtin-arr-dir"):
          if is-List(opts.get-value("builtin-arr-dir")):
            B.set-builtin-arr-dirs(opts.get-value("builtin-arr-dir"))
          else:
            B.set-builtin-arr-dirs([list: opts.get-value("builtin-arr-dir")])
          end
        end

        session-id = S.generate-session-id()
        compiled-dir = opts.get("compiled-dir").or-else("./compiled")
        base-dir-str = opts.get("base-dir").or-else(".")
        checks-str = opts.get("checks").or-else("main")
        type-check = opts.get("type-check").or-else(false)
        perilous = opts.get("perilous").or-else(false)

        compile-opts = CS.make-default-compile-options(pyret-dir).{
          this-pyret-dir: pyret-dir,
          compiled-cache: compiled-dir,
          compiled-read-only: link(P.resolve(P.join(pyret-dir, "lib-compiled")), empty),
          base-dir: base-dir-str,
          checks: checks-str,
          checks-format: "text",
          type-check: type-check,
          allow-shadowed: false,
          collect-all: false,
          proper-tail-calls: true,
          display-progress: false,
          user-annotations: not(perilous),
          log: log,
          log-error: log-err
        }

        # Mirror the context cli-module-loader builds for the compile path, so
        # builtin modules resolve from the precompiled stdlib (lib-compiled)
        # instead of being recompiled from scratch on the first interaction.
        start-context = {
          current-load-path: P.resolve(base-dir-str),
          cache-base-dir: compile-opts.compiled-cache,
          compiled-read-only-dirs: compile-opts.compiled-read-only.map(P.resolve),
          url-file-mode: compile-opts.url-file-mode
        }

        # Create a fresh runtime whose stdout routes to current-send.
        r = RL.make-runtime()
        RL.set-stdout(r, lam(s):
          d = [SD.string-dict: "type", J.j-str("repl-stdout"), "contents", J.j-str(s)]
          current-send(J.j-obj(d).serialize())
        end)

        repl = R.make-repl(r, SD.make-mutable-string-dict(), L.empty-realm(), start-context, lam(): CLI.module-finder end)
        defs-locator = repl.make-definitions-locator(lam(): "" end, CS.standard-globals)

        current-send := send-message

        init-result = run-task(lam():
          repl.restart-interactions(defs-locator, compile-opts)
        end)

        cases(E.Either) init-result block:
          | right(exn) =>
            err-str = RED.display-to-string(exn-unwrap(exn).render-reason(), tostring, empty)
            send-message(J.j-obj([SD.string-dict:
              "type", J.j-str("repl-error"),
              "kind", J.j-str("init"),
              "message", J.j-str(err-str)]).serialize())
          | left(_) =>
            repl-sessions.set-now(session-id, {repl: repl, compile-opts: compile-opts})
            send-message(J.j-obj([SD.string-dict:
              "type", J.j-str("repl-ready"),
              "session", J.j-str(session-id)]).serialize())
        end
      end

    else if command == "repl-interact":
      block:
        session-id = full.get-value("session")
        code = full.get-value("code")

        if not(repl-sessions.has-key-now(session-id)):
          send-message(J.j-obj([SD.string-dict:
            "type", J.j-str("repl-error"),
            "kind", J.j-str("no-session"),
            "message", J.j-str("Unknown REPL session: " + session-id)]).serialize())
        else:
          block:
            session = repl-sessions.get-value-now(session-id)
            current-send := send-message

            interact-result = run-task(lam():
              locator = session.repl.make-interaction-locator(lam(): code end)
              session.repl.run-interaction(locator)
            end)

            cases(E.Either) interact-result block:
              | right(infra-exn) =>
                err-str = RED.display-to-string(exn-unwrap(infra-exn).render-reason(), tostring, empty)
                send-message(J.j-obj([SD.string-dict:
                  "type", J.j-str("repl-error"),
                  "kind", J.j-str("internal"),
                  "message", J.j-str(err-str)]).serialize())

              | left(repl-either) =>
                cases(E.Either) repl-either block:
                  | left(compile-errs) =>
                    err-parts = for map(ce from compile-errs):
                      cases(CS.CompileResult) ce:
                        | ok(_) => ""
                        | err(problems) =>
                          for map(p from problems):
                            RED.display-to-string(p.render-reason(), torepr, empty)
                          end.join-str("\n")
                      end
                    end
                    send-message(J.j-obj([SD.string-dict:
                      "type", J.j-str("repl-error"),
                      "kind", J.j-str("compile"),
                      "message", J.j-str(err-parts.join-str("\n"))]).serialize())

                  | right(module-result) =>
                    if L.is-success-result(module-result):
                      block:
                        repr-opt = L.get-result-repr(module-result)
                        when is-some(repr-opt):
                          send-message(J.j-obj([SD.string-dict:
                            "type", J.j-str("repl-value"),
                            "repr", J.j-str(repr-opt.value)]).serialize())
                        end
                        # Only render checks when the interaction actually
                        # defined tests; otherwise render-check-results returns
                        # "The program didn't define any tests." for every line.
                        when L.result-has-checks(module-result):
                          checks-msg = L.render-check-results(module-result).message
                          when not(string-equal(checks-msg, "")):
                            send-message(J.j-obj([SD.string-dict:
                              "type", J.j-str("repl-check"),
                              "message", J.j-str(checks-msg)]).serialize())
                          end
                        end
                      end
                    else:
                      block:
                        err = L.render-error-message(module-result)
                        send-message(J.j-obj([SD.string-dict:
                          "type", J.j-str("repl-error"),
                          "kind", J.j-str("runtime"),
                          "message", J.j-str(err.message)]).serialize())
                      end
                    end
                end
            end
          end
        end
      end

    else if command == "repl-close":
      block:
        session-id = full.get("session").or-else("")
        when repl-sessions.has-key-now(session-id):
          repl-sessions.remove-now(session-id)
        end
        send-message(J.j-obj([SD.string-dict: "type", J.j-str("repl-closed")]).serialize())
      end

    else:
      log-err("Unknown server command: " + command + "\n")
    end
  end)
end
