provide *

# Direct-mode code generator: compiles ANF Pyret straight to plain,
# synchronous JavaScript with thin value representations.  No stack
# segmentation, no activation records, no splitting, no annotation checks.
# See direct-work/DESIGN.md at the repo root of lang/ for the full design.
#
# The output module keeps the stock loadable shape:
#   { requires, provides, nativeRequires, theModule, theMap }
# with theModule = function(RUNTIME, NAMESPACE, uri, ...imports) expecting
# the *direct* runtime (src/js/base/runtime-direct.js).

import ast as A
import srcloc as SL
import string-dict as D
import sha as sha
import file("ast-anf.arr") as N
import file("js-ast.arr") as J
import file("concat-lists.arr") as CL
import file("compile-structs.arr") as CS
import file("ast-util.arr") as AU
import file("anf-loop-compiler.arr") as AL

type Loc = SL.Srcloc
type CList = CL.ConcatList
clist = CL.clist

cl-empty = CL.concat-empty
cl-sing = CL.concat-singleton
cl-append = CL.concat-append
cl-cons = CL.concat-cons
cl-snoc = CL.concat-snoc

j-fun = J.j-fun
j-var = J.j-var
j-id = J.j-id
j-method = J.j-method
j-block = J.j-block
j-block1 = J.j-block1
j-true = J.j-true
j-false = J.j-false
j-num = J.j-num
j-str = J.j-str
j-return = J.j-return
j-assign = J.j-assign
j-if = J.j-if
j-if1 = J.j-if1
j-new = J.j-new
j-app = J.j-app
j-list = J.j-list
j-obj = J.j-obj
j-dot = J.j-dot
j-bracket = J.j-bracket
j-field = J.j-field
j-dot-assign = J.j-dot-assign
j-bracket-assign = J.j-bracket-assign
j-throw = J.j-throw
j-expr = J.j-expr
j-binop = J.j-binop
j-eq = J.j-eq
j-neq = J.j-neq
j-ternary = J.j-ternary
j-null = J.j-null
j-parens = J.j-parens
j-switch = J.j-switch
j-case = J.j-case
j-default = J.j-default
j-break = J.j-break
j-undefined = J.j-undefined
j-raw-code = J.j-raw-code

fun get-exp(o): o.exp end
fun get-id(o): o.id end

# Fresh JS-safe names.  Same discipline as anf-loop-compiler: the atom
# counter resets per module; the key->atom cache and the used-name set
# persist for the process (guaranteeing no collisions either way).
js-names = A.MakeName(0)
js-ids = D.make-mutable-string-dict()
effective-ids = D.make-mutable-string-dict()
fun fresh-id(id :: A.Name) -> A.Name:
  base-name = if A.is-s-type-global(id): id.tosourcestring() else: id.toname() end
  no-hyphens = string-replace(base-name, "-", "$")
  n = js-names.make-atom(no-hyphens)
  if effective-ids.has-key-now(n.tosourcestring()) block:
    fresh-id(id)
  else:
    effective-ids.set-now(n.tosourcestring(), true)
    n
  end
end
fun js-id-of(id :: A.Name) -> A.Name:
  s = id.key()
  if js-ids.has-key-now(s) block:
    js-ids.get-value-now(s)
  else:
    safe-id = fresh-id(id)
    js-ids.set-now(s, safe-id)
    safe-id
  end
end

fun const-id(name :: String):
  A.s-name(A.dummy-loc, name)
end
fun compiler-name(id):
  const-id(string-append("$", id))
end

RUNTIME = j-id(const-id("R"))
NAMESPACE = j-id(const-id("NAMESPACE"))
source-name = j-id(const-id("M"))
THIS = j-id(const-id("this"))
ARGUMENTS = j-id(const-id("arguments"))
LOCS-NAME = const-id("L")
LOCS = j-id(LOCS-NAME)

fun rt-field(name): j-dot(RUNTIME, name) end
fun rt(name, args): j-method(RUNTIME, name, args) end

fun jbool(b):
  if b: j-true else: j-false end
end

reserved-names = [D.string-dict:
  "break", true, "case", true, "catch", true, "class", true, "const", true,
  "continue", true, "debugger", true, "default", true, "delete", true,
  "do", true, "else", true, "enum", true, "export", true, "extends", true,
  "false", true, "finally", true, "for", true, "function", true, "if", true,
  "import", true, "in", true, "instanceof", true, "new", true, "null", true,
  "return", true, "super", true, "switch", true, "this", true, "throw", true,
  "true", true, "try", true, "typeof", true, "var", true, "void", true,
  "while", true, "with", true, "yield", true, "let", true, "static", true,
  "implements", true, "interface", true, "package", true, "private", true,
  "protected", true, "public", true, "arguments", true, "eval", true
]

fun is-js-identifier(s :: String) -> Boolean:
  if s == "": false
  else if reserved-names.has-key(s): false
  else:
    ok-first = lam(c):
      ((c >= "a") and (c <= "z")) or ((c >= "A") and (c <= "Z")) or (c == "_") or (c == "$")
    end
    ok-rest = lam(c):
      ok-first(c) or ((c >= "0") and (c <= "9"))
    end
    chars = string-explode(s)
    ok-first(chars.first) and chars.rest.all(ok-rest)
  end
end

fun fun-name-of(s :: String) -> String:
  # A JS-safe (possibly empty) function name for stack traces
  cleaned = for fold(acc from "", c from string-explode(s)):
    if ((c >= "a") and (c <= "z")) or ((c >= "A") and (c <= "Z")) or ((c >= "0") and (c <= "9")) or (c == "_") or (c == "$"):
      acc + c
    else:
      acc + "$"
    end
  end
  if cleaned == "": "" else: "_" + cleaned end
end

fun obj-field(name :: String, value :: J.JExpr):
  j-field(name, value)
end

# get a field off a JS object where the field name may not be a valid
# JS identifier
fun sget(obj :: J.JExpr, name :: String) -> J.JExpr:
  if is-js-identifier(name): j-dot(obj, name)
  else: j-bracket(obj, j-str(name))
  end
end
fun sset(obj :: J.JExpr, name :: String, v :: J.JExpr) -> J.JExpr:
  if is-js-identifier(name): j-dot-assign(obj, name, v)
  else: j-bracket-assign(obj, j-str(name), v)
  end
end
fun scall(obj :: J.JExpr, name :: String, args) -> J.JExpr:
  if is-js-identifier(name): j-method(obj, name, args)
  else: j-app(j-bracket(obj, j-str(name)), args)
  end
end

data Dest:
  | d-return
  | d-assign(name :: A.Name)
  | d-discard
end

fun finish(dest :: Dest, e :: J.JExpr) -> CList<J.JStmt>:
  cases(Dest) dest:
    | d-return => cl-sing(j-return(e))
    | d-assign(n) => cl-sing(j-expr(j-assign(n, e)))
    | d-discard => cl-sing(j-expr(j-parens(e)))
  end
end

fun arity-stmt(name :: String, n :: Number) -> J.JStmt:
  j-if1(j-binop(j-dot(ARGUMENTS, "length"), j-neq, j-num(n)),
    j-block1(j-expr(rt("ae", [clist: j-str(name), j-num(n), j-dot(ARGUMENTS, "length")]))))
end

fun compile-ann(ctx, ann :: A.Ann) -> J.JExpr:
  # Annotations are not checked at runtime in direct mode; we only need
  # *some* value for type-let bindings and type exports.
  cases(A.Ann) ann:
    | a-name(l, name) => j-id(js-id-of(name))
    | else => rt-field("Any")
  end
end

fun compile-v(ctx, v :: N.AVal) -> J.JExpr:
  cases(N.AVal) v:
    # Like stock codegen: srcloc values are the raw interned location arrays
    | a-srcloc(l, loc) =>
      j-bracket(LOCS, j-num(ctx.get-loc-id(loc)))
    | a-num(l, n) =>
      if num-is-fixnum(n):
        j-parens(j-num(n))
      else:
        rt("makeNumberFromString", [clist: j-str(tostring(n))])
      end
    | a-str(l, s) => j-parens(j-str(s))
    | a-bool(l, b) => j-parens(jbool(b))
    | a-undefined(l) => j-undefined
    | a-prim-val(l, name) => rt-field(name)
    | a-id(l, id) => j-id(js-id-of(id))
    | a-id-modref(l, id, uri, name) =>
      # The import is bound to the *exported view* of the module:
      # { values, types, internal, defined-values, defined-types }
      j-bracket(j-dot(j-id(js-id-of(id)), "values"), j-str(name))
    # letrec bindings are a-var boxes at the ANF level (letrec desugars to
    # var-binds + assigns), so letrec reads deref the box
    | a-id-safe-letrec(l, id) => j-dot(j-id(js-id-of(id)), "$var")
  end
end

fun compile-cases-branch(ctx, subject :: J.JExpr, branch :: N.ACasesBranch, dest :: Dest) -> J.JCase:
  body-stmts = cases(N.ACasesBranch) branch block:
    | a-cases-branch(l, pat-loc, name, args, body) =>
      arity-guard = j-if1(j-binop(j-dot(subject, "$arity"), j-neq, j-num(args.length())),
        j-block1(j-expr(rt("cerr", [clist: subject, j-str(name), j-num(args.length())]))))
      binds = for CL.map_list_n(i from 0, arg from args):
        cases(N.ACasesBind) arg:
          | a-cases-bind(l2, field-type, b) =>
            getter = if A.is-s-cases-bind-ref(field-type): "cr" else: "cf" end
            j-var(js-id-of(b.id), rt(getter, [clist: subject, j-num(i)]))
        end
      end
      cl-cons(arity-guard, binds) ^ cl-append(_, compile-expr(ctx, body, dest))
    | a-singleton-cases-branch(l, pat-loc, name, body) =>
      compile-expr(ctx, body, dest)
  end
  with-break = if is-d-return(dest): body-stmts else: cl-snoc(body-stmts, j-break) end
  j-case(j-str(branch.name), j-block(with-break))
end

fun compile-data-expr(ctx, l, name, namet, variants, shared) -> { CList<J.JStmt>; J.JExpr } block:
  external-brand = j-id(js-id-of(namet))
  shared-vfields = for CL.map_list(f from shared):
    obj-field(f.name, compile-v(ctx, f.value))
  end

  var all-stmts = cl-empty
  var obj-fields = cl-empty

  for each(v from variants) block:
    vname = v.name
    proto-id = fresh-id(compiler-name(vname + "$proto"))
    vbrand-id = fresh-id(compiler-name(vname + "$brand"))
    brands-id = fresh-id(compiler-name(vname + "$brands"))

    with-vfields = for CL.map_list(f from v.with-members):
      obj-field(f.name, compile-v(ctx, f.value))
    end

    meta-fields = cases(N.AVariant) v:
      | a-variant(_, _, _, members, _) =>
        [clist:
          obj-field("$name", j-str(vname)),
          obj-field("$fields", j-list(false, for CL.map_list(m from members): j-str(m.bind.id.toname()) end)),
          obj-field("$muts", j-list(false, for CL.map_list(m from members): jbool(N.is-a-mutable(m.member-type)) end)),
          obj-field("$arity", j-num(members.length())),
          obj-field("$brands", j-id(brands-id)),
          obj-field("_match", rt-field("vMatch"))
        ]
      | a-singleton-variant(_, _, _) =>
        [clist:
          obj-field("$name", j-str(vname)),
          obj-field("$brands", j-id(brands-id)),
          obj-field("_match", rt-field("vMatch"))
        ]
    end

    proto-fields = cl-cons(obj-field("__proto__", j-null),
      shared-vfields + with-vfields + meta-fields)

    brand-stmts = [clist:
      j-var(vbrand-id, rt("namedBrander", [clist: j-str(vname)])),
      j-var(brands-id, j-obj([clist: obj-field("__proto__", j-null)])),
      j-expr(j-bracket-assign(j-id(brands-id), j-dot(external-brand, "_brand"), j-true)),
      j-expr(j-bracket-assign(j-id(brands-id), j-dot(j-id(vbrand-id), "_brand"), j-true)),
      j-var(proto-id, j-obj(proto-fields))
    ]

    pred-name = A.make-checker-name(vname)
    pred-id = fresh-id(compiler-name("is$" + vname))
    pred-stmt = j-var(pred-id,
      j-fun(J.next-j-fun-id(), fun-name-of(pred-name), [clist: const-id("val")],
        j-block([clist:
            arity-stmt(pred-name, 1),
            j-return(rt("hb", [clist: j-id(const-id("val")), j-dot(j-id(vbrand-id), "_brand")]))])))

    { ctor-stmts; ctor-expr } = cases(N.AVariant) v block:
      | a-variant(_, constr-loc, _, members, _) =>
        base-id = fresh-id(compiler-name(vname + "$base"))
        member-args = for CL.map_list(m from members): js-id-of(m.bind.id) end
        assign-stmts = for CL.map_list(m from members):
          arg = j-id(js-id-of(m.bind.id))
          wrapped = if N.is-a-mutable(m.member-type): rt("ref", [clist: arg]) else: arg end
          j-expr(sset(THIS, m.bind.id.toname(), wrapped))
        end
        base-stmts = [clist:
          j-var(base-id, j-fun(J.next-j-fun-id(), fun-name-of(vname + "$base"), member-args, j-block(assign-stmts))),
          j-expr(j-dot-assign(j-id(base-id), "prototype", j-id(proto-id)))
        ]
        n = members.length()
        ctor = j-fun(J.next-j-fun-id(), fun-name-of(vname), member-args,
          j-block([clist:
              arity-stmt(vname, n),
              j-return(j-new(j-id(base-id), for CL.map_list(m from members): j-id(js-id-of(m.bind.id)) end))]))
        { base-stmts; ctor }
      | a-singleton-variant(_, _, _) =>
        base-id = fresh-id(compiler-name(vname + "$base"))
        base-stmts = [clist:
          j-var(base-id, j-fun(J.next-j-fun-id(), fun-name-of(vname + "$base"), cl-empty, j-block(cl-empty))),
          j-expr(j-dot-assign(j-id(base-id), "prototype", j-id(proto-id)))
        ]
        { base-stmts; j-new(j-id(base-id), cl-empty) }
    end

    ctor-id = fresh-id(compiler-name(vname + "$ctor"))
    all-stmts := all-stmts
      ^ cl-append(_, brand-stmts)
      ^ cl-append(_, ctor-stmts)
      ^ cl-snoc(_, pred-stmt)
      ^ cl-snoc(_, j-var(ctor-id, ctor-expr))
    obj-fields := obj-fields
      ^ cl-snoc(_, obj-field(pred-name, j-id(pred-id)))
      ^ cl-snoc(_, obj-field(vname, j-id(ctor-id)))
  end

  data-pred = j-fun(J.next-j-fun-id(), fun-name-of(name), [clist: const-id("val")],
    j-block([clist:
        arity-stmt(name, 1),
        j-return(rt("hb", [clist: j-id(const-id("val")), j-dot(external-brand, "_brand")]))]))

  data-obj = j-obj(
    cl-cons(obj-field("__proto__", j-null),
      cl-cons(obj-field(name, data-pred), obj-fields)))
  { all-stmts; data-obj }
end

# Compiles a lettable that has a natural expression form.
# Returns none for statement-shaped lettables (a-if, a-cases).
fun compile-lettable-expr(ctx, e :: N.ALettable) -> Option<{ CList<J.JStmt>; J.JExpr }>:
  cases(N.ALettable) e:
    | a-module(l, answer, dm, dv, dt, checks) =>
      some(compile-module-value(ctx, l, answer, dm, dv, dt, checks))
    | a-if(_, _, _, _) => none
    | a-cases(_, _, _, _, _) => none
    | a-assign(l, id, value) =>
      some({cl-sing(j-expr(j-dot-assign(j-id(js-id-of(id)), "$var", compile-v(ctx, value)))); rt-field("nothing")})
    | a-app(l, f, args, app-info) =>
      some({cl-empty; j-app(compile-v(ctx, f), CL.map_list(compile-v(ctx, _), args))})
    | a-method-app(l, obj, meth, args) =>
      some({cl-empty; scall(compile-v(ctx, obj), meth, CL.map_list(compile-v(ctx, _), args))})
    | a-prim-app(l, f, args, app-info) =>
      some({cl-empty; rt(f, CL.map_list(compile-v(ctx, _), args))})
    | a-ref(l, maybe-ann) =>
      some({cl-empty; rt("makeGraphableRef", cl-empty)})
    | a-tuple(l, fields) =>
      some({cl-empty; rt("tup", [clist: j-list(false, CL.map_list(compile-v(ctx, _), fields))])})
    | a-tuple-get(l, tup, index) =>
      some({cl-empty; j-bracket(compile-v(ctx, tup), j-num(index))})
    | a-obj(l, fields) =>
      some({cl-empty; j-obj(cl-cons(obj-field("__proto__", j-null),
              for CL.map_list(f from fields): obj-field(f.name, compile-v(ctx, f.value)) end))})
    | a-update(l, supe, fields) =>
      some({cl-empty; rt("upd", [clist: compile-v(ctx, supe),
              j-obj(cl-cons(obj-field("__proto__", j-null),
                  for CL.map_list(f from fields): obj-field(f.name, compile-v(ctx, f.value)) end))])})
    | a-extend(l, supe, fields) =>
      some({cl-empty; rt("ext", [clist: compile-v(ctx, supe),
              j-obj(cl-cons(obj-field("__proto__", j-null),
                  for CL.map_list(f from fields): obj-field(f.name, compile-v(ctx, f.value)) end))])})
    | a-dot(l, obj, field) =>
      some({cl-empty; rt("g", [clist: compile-v(ctx, obj), j-str(field)])})
    | a-colon(l, obj, field) =>
      some({cl-empty; rt("gc", [clist: compile-v(ctx, obj), j-str(field)])})
    | a-get-bang(l, obj, field) =>
      some({cl-empty; rt("gb", [clist: compile-v(ctx, obj), j-str(field)])})
    | a-lam(l, name, args, ret, body) =>
      some({cl-empty; compile-fun(ctx, name, args, body, false)})
    | a-method(l, name, args, ret, body) =>
      some({cl-empty; rt("mkM", [clist: compile-fun(ctx, name, args, body, true), j-str(name)])})
    | a-id-var(l, id) =>
      some({cl-empty; j-dot(j-id(js-id-of(id)), "$var")})
    | a-id-var-modref(l, id, uri, name) =>
      some({cl-empty; j-dot(j-bracket(j-dot(j-id(js-id-of(id)), "values"), j-str(name)), "$var")})
    | a-id-letrec(l, id, safe) =>
      s = j-dot(j-id(js-id-of(id)), "$var")
      if safe:
        some({cl-empty; s})
      else:
        some({cl-empty; j-ternary(j-binop(s, j-eq, j-undefined),
              rt("uninit", [clist: j-str(id.toname())]), s)})
      end
    | a-data-expr(l, name, namet, variants, shared) =>
      { stmts; e2 } = compile-data-expr(ctx, l, name, namet, variants, shared)
      some({stmts; e2})
    | a-val(l, v) =>
      some({cl-empty; compile-v(ctx, v)})
  end
end

# Does this expression contain a self-recursive tail call (not inside a
# nested function)?
fun has-self-tail-expr(e :: N.AExpr) -> Boolean:
  cases(N.AExpr) e:
    | a-type-let(_, _, body) => has-self-tail-expr(body)
    | a-let(_, _, le, body) => has-self-tail-lettable(le) or has-self-tail-expr(body)
    | a-arr-let(_, _, _, le, body) => has-self-tail-lettable(le) or has-self-tail-expr(body)
    | a-var(_, _, le, body) => has-self-tail-lettable(le) or has-self-tail-expr(body)
    | a-seq(_, e1, e2) => has-self-tail-lettable(e1) or has-self-tail-expr(e2)
    | a-lettable(_, le) => has-self-tail-lettable(le)
  end
end
fun has-self-tail-lettable(e :: N.ALettable) -> Boolean:
  cases(N.ALettable) e:
    | a-app(_, _, _, app-info) => app-info.is-recursive and app-info.is-tail
    | a-if(_, _, t, alt) => has-self-tail-expr(t) or has-self-tail-expr(alt)
    | a-cases(_, _, _, branches, _else) =>
      branches.any(lam(b): has-self-tail-expr(b.body) end) or has-self-tail-expr(_else)
    | else => false
  end
end

fun compile-lettable(ctx, e :: N.ALettable, dest :: Dest) -> CList<J.JStmt>:
  is-self-tail-call = cases(N.ALettable) e:
    | a-app(_, _, args, app-info) =>
      app-info.is-recursive and app-info.is-tail and is-d-return(dest)
        and is-some(ctx.tco-formals)
        and (args.length() == ctx.tco-formals.value.length())
    | else => false
  end
  if is-self-tail-call block:
    cases(N.ALettable) e:
      | a-app(l, _, args, _) =>
        formals = ctx.tco-formals.value
        arg-temps = for map(arg from args):
          { tmp: fresh-id(compiler-name("tco")), value: compile-v(ctx, arg) }
        end
        temp-stmts = for CL.map_list(at from arg-temps):
          j-var(at.tmp, at.value)
        end
        assign-stmts = for CL.map_list(pair from map2({(f, at): {f; at}}, formals, arg-temps)):
          j-expr(j-assign(pair.{0}, j-id(pair.{1}.tmp)))
        end
        temp-stmts ^ cl-append(_, assign-stmts) ^ cl-snoc(_, J.j-continue)
    end
  else:
    compile-lettable-nontail(ctx, e, dest)
  end
end

fun compile-lettable-nontail(ctx, e :: N.ALettable, dest :: Dest) -> CList<J.JStmt>:
  cases(Option) compile-lettable-expr(ctx, e):
    | some({stmts; expr}) => cl-append(stmts, finish(dest, expr))
    | none =>
      cases(N.ALettable) e:
        | a-if(l, c, t, alt) =>
          cl-sing(j-if(compile-v(ctx, c),
              j-block(compile-expr(ctx, t, dest)),
              j-block(compile-expr(ctx, alt, dest))))
        | a-cases(l, typ, val, branches, _else) =>
          subject = compile-v(ctx, val)
          branch-cases = for CL.map_list(b from branches):
            compile-cases-branch(ctx, subject, b, dest)
          end
          else-case = j-default(j-block(compile-expr(ctx, _else, dest)))
          cl-sing(j-switch(j-dot(subject, "$name"), cl-snoc(branch-cases, else-case)))
      end
  end
end

fun compile-fun(ctx, name :: String, args :: List<N.ABind>, body :: N.AExpr, is-method :: Boolean) -> J.JExpr:
  formals = if is-method: args.rest else: args end
  formal-ids-list = for map(a from formals): js-id-of(a.id) end
  formal-ids = for CL.map_list(a from formals): js-id-of(a.id) end
  self-stmts = if is-method:
    cl-sing(j-var(js-id-of(args.first.id), THIS))
  else:
    cl-empty
  end
  n = formals.length()
  uses-tco = not(is-method) and has-self-tail-expr(body)
  body-ctx = if uses-tco:
    ctx.{tco-formals: some(formal-ids-list)}
  else:
    ctx.{tco-formals: none}
  end
  body-stmts-raw = compile-expr(body-ctx, body, d-return)
  body-stmts = if uses-tco:
    # Self-recursive tail calls compile to parameter reassignment + continue
    cl-sing(J.j-while(j-true, j-block(body-stmts-raw)))
  else:
    body-stmts-raw
  end
  j-fun(J.next-j-fun-id(), fun-name-of(name), formal-ids,
    j-block(cl-cons(arity-stmt(if name == "": "anonymous function" else: name end, n), self-stmts)
        ^ cl-append(_, body-stmts)))
end

fun compile-expr(ctx, e :: N.AExpr, dest :: Dest) -> CList<J.JStmt>:
  cases(N.AExpr) e:
    | a-type-let(l, bind, body) =>
      bind-stmts = cases(N.ATypeBind) bind:
        | a-type-bind(l2, name, ann) =>
          cl-sing(j-var(js-id-of(name), compile-ann(ctx, ann)))
        | a-newtype-bind(l2, name, namet) =>
          [clist:
            j-var(js-id-of(namet), rt("namedBrander", [clist: j-str(name.toname())])),
            j-var(js-id-of(name), rt("makeBranderAnn", [clist: j-id(js-id-of(namet)), j-str(name.toname())]))]
      end
      cl-append(bind-stmts, compile-expr(ctx, body, dest))
    | a-let(l, b, le, body) =>
      target = js-id-of(b.id)
      let-stmts = cases(Option) compile-lettable-expr(ctx, le):
        | some({stmts; expr}) => cl-snoc(stmts, j-var(target, expr))
        | none =>
          cl-cons(j-var(target, j-undefined), compile-lettable(ctx, le, d-assign(target)))
      end
      cl-append(let-stmts, compile-expr(ctx, body, dest))
    | a-arr-let(l, b, idx, le, body) =>
      arr = j-id(js-id-of(b.id))
      set-stmts = cases(Option) compile-lettable-expr(ctx, le):
        | some({stmts; expr}) => cl-snoc(stmts, j-expr(j-bracket-assign(arr, j-num(idx), expr)))
        | none =>
          tmp = fresh-id(compiler-name("arrlet"))
          cl-cons(j-var(tmp, j-undefined),
            cl-snoc(compile-lettable(ctx, le, d-assign(tmp)),
              j-expr(j-bracket-assign(arr, j-num(idx), j-id(tmp)))))
      end
      cl-append(set-stmts, compile-expr(ctx, body, dest))
    | a-var(l, b, le, body) =>
      target = js-id-of(b.id)
      var-stmts = cases(Option) compile-lettable-expr(ctx, le):
        | some({stmts; expr}) =>
          cl-snoc(stmts, j-var(target, j-obj([clist: obj-field("$var", expr)])))
        | none =>
          tmp = fresh-id(compiler-name("varval"))
          cl-cons(j-var(tmp, j-undefined),
            cl-snoc(compile-lettable(ctx, le, d-assign(tmp)),
              j-var(target, j-obj([clist: obj-field("$var", j-id(tmp))]))))
      end
      cl-append(var-stmts, compile-expr(ctx, body, dest))
    | a-seq(l, e1, e2) =>
      cl-append(compile-lettable(ctx, e1, d-discard), compile-expr(ctx, e2, dest))
    | a-lettable(l, le) =>
      compile-lettable(ctx, le, dest)
  end
end

fun compile-module-value(ctx, l, answer, dms, dvs, dts, checks) -> { CList<J.JStmt>; J.JExpr } block:
  # Mirrors the stock a-module compilation, with plain JS objects.
  mp-specs = ctx.prog-provides.specs.filter(A.is-s-provide-module)
  vp-specs = ctx.prog-provides.specs.filter(A.is-s-provide-name)
  tp-specs = ctx.prog-provides.specs.filter(A.is-s-provide-type)

  types-fields = for CL.map_list(tp from tp-specs):
    cases(A.NameSpec) tp.name-spec:
      | s-local-ref(_, name, as-name) =>
        obj-field(as-name.toname(), compile-ann(ctx, A.a-name(l, name)))
      | s-remote-ref(_, uri, name, as-name) =>
        obj-field(as-name.toname(), rt("getModuleField", [clist: j-str(uri), j-str("types"), j-str(name.toname())]))
    end
  end

  compiled-provides = for CL.map_list(pv from vp-specs):
    cases(A.NameSpec) pv.name-spec:
      | s-local-ref(_, name, as-name) =>
        val-bind = ctx.post-env.bindings.get-value-now(name.key())
        val-exp = cases(CS.ValueBinder) val-bind.binder:
          | vb-letrec => j-dot(j-id(js-id-of(name)), "$var")
          | vb-var => j-id(js-id-of(name))
          | vb-let => j-id(js-id-of(name))
        end
        obj-field(as-name.toname(), val-exp)
      | s-remote-ref(_, uri, name, as-name) =>
        obj-field(as-name.toname(), rt("getModuleField", [clist: j-str(uri), j-str("values"), j-str(name.toname())]))
    end
  end

  compiled-module-provides = for CL.map_list(pm from mp-specs):
    cases(A.NameSpec) pm.name-spec:
      | s-local-ref(_, name, as-name) =>
        obj-field(as-name.toname(), j-id(js-id-of(name)))
      | s-remote-ref(_, uri, name, as-name) =>
        obj-field(as-name.toname(), j-bracket(rt-field("modules"), j-str(uri)))
    end
  end

  ans = compile-v(ctx, answer)
  chks = compile-v(ctx, checks)

  module-obj = j-obj([clist:
      obj-field("answer", ans),
      obj-field("namespace", NAMESPACE),
      obj-field("locations", LOCS),
      obj-field("defined-modules",
        j-obj(for CL.map_list(dm from dms):
            obj-field(dm.name, j-id(js-id-of(dm.value)))
          end)),
      obj-field("defined-values",
        j-obj(for CL.map_list(dv from dvs):
            cases(N.ADefinedValue) dv:
              | a-defined-value(name, value) => obj-field(name, compile-v(ctx, value))
              | a-defined-var(name, id) => obj-field(name, j-id(js-id-of(id)))
            end
          end)),
      obj-field("defined-types",
        j-obj(for CL.map_list(dt from dts):
            obj-field(dt.name, compile-ann(ctx, dt.typ))
          end)),
      obj-field("provide-plus-types",
        j-obj([clist:
            obj-field("values", j-obj(compiled-provides)),
            obj-field("types", j-obj(types-fields)),
            obj-field("modules", j-obj(compiled-module-provides))
          ])),
      obj-field("checks", chks)])
  { cl-empty; module-obj }
end

fun import-key(i): AU.import-to-dep(i).key() end

fun compile-program(prog :: N.AProg, env, post-env, provides, options) -> D.StringDict block:
  js-names.reset()
  cases(N.AProg) prog block:
    | a-program(l, prog-provides, imports-in, body) =>
      freevars = N.freevars-prog(prog).unfreeze()

      imports = imports-in.filter(A.is-s-import).sort-by(
          lam(i1, i2): import-key(i1.file) < import-key(i2.file) end,
          lam(i1, i2): import-key(i1.file) == import-key(i2.file) end
        )

      for each(i from imports) block:
        cases(A.Import) i:
          | s-import(_, _, mod-name) =>
            freevars.remove-now(mod-name.key())
          | else => nothing
        end
      end

      free-ids = for map(k from freevars.keys-list-now().sort()):
        freevars.get-value-now(k)
      end
      module-and-global-binds = lists.partition(A.is-s-atom, free-ids)
      global-binds = for CL.map_list(n from module-and-global-binds.is-false):
        { maybe-origin; which } =
          cases(A.Name) n:
            | s-module-global(s) =>
              { env.origin-by-module-name(n.toname()); "modules" }
            | s-global(s) =>
              { env.origin-by-value-name(n.toname()); "values" }
            | s-type-global(s) =>
              { env.origin-by-type-name(n.toname()); "types" }
          end
        { uri; name } = cases(Option) maybe-origin:
          | some(origin) => { origin.uri-of-definition; origin.original-name.toname() }
          | none => raise(n.toname() + " not found")
        end
        j-var(js-id-of(n), rt("getModuleField", [clist: j-str(uri), j-str(which), j-str(name)]))
      end
      module-binds = for CL.map_list(n from module-and-global-binds.is-true):
        { which; uri; lookup-name } = ask:
          | post-env.bindings.has-key-now(n.key()) then:
            val-bind = post-env.bindings.get-value-now(n.key())
            { "values"; val-bind.origin.uri-of-definition; val-bind.origin.original-name }
          | post-env.type-bindings.has-key-now(n.key()) then:
            typ-bind = post-env.type-bindings.get-value-now(n.key())
            { "types"; typ-bind.origin.uri-of-definition; typ-bind.origin.original-name }
          | post-env.module-bindings.has-key-now(n.key()) then:
            mod-bind = post-env.module-bindings.get-value-now(n.key())
            { "modules"; mod-bind.origin.uri-of-definition; mod-bind.origin.original-name }
        end
        j-var(js-id-of(n), rt("getModuleField", [clist: j-str(uri), j-str(which), j-str(lookup-name.toname())]))
      end

      mod-ids = imports.map(lam(i): js-id-of(i.name) end)
      module-locators = imports.map(lam(i): AU.import-to-dep(i.file) end)
      # Always fresh: two `import ... as _` lines would otherwise produce
      # duplicate parameter names (a SyntaxError in strict mode)
      input-ids = CL.map_list(lam(i):
          js-names.make-atom("$" + i.toname())
        end, mod-ids)
      module-specs = for map2(i from imports, in-id from input-ids.to-list()):
        { name: i.name, input-id: in-id }
      end
      import-binds = for CL.map_list(ms from module-specs):
        j-var(js-id-of(ms.name), j-id(ms.input-id))
      end

      var locations = cl-empty
      var loc-count = 0
      loc-cache = D.make-mutable-string-dict()
      fun get-loc-id(loc :: Loc) block:
        as-str = loc.key()
        if loc-cache.has-key-now(as-str) block:
          loc-cache.get-value-now(as-str)
        else:
          ans = loc-count
          loc-cache.set-now(as-str, ans)
          loc-count := loc-count + 1
          locations := cl-snoc(locations, AL.obj-of-loc(loc))
          ans
        end
      end

      ctx = {
        uri: provides.from-uri,
        options: options,
        get-loc-id: get-loc-id,
        prog-provides: prog-provides,
        env: env,
        post-env: post-env,
        tco-formals: none
      }

      body-stmts = compile-expr(ctx, body, d-return)

      module-body = j-block(
        [clist: j-expr(j-str("use strict"))]
          ^ cl-append(_, import-binds)
          ^ cl-snoc(_, j-var(LOCS-NAME, j-list(true, locations)))
          ^ cl-append(_, global-binds)
          ^ cl-append(_, module-binds)
          ^ cl-append(_, body-stmts))

      module-locators-as-js = for CL.map_list(m from module-locators):
        cases(CS.Dependency) m:
          | builtin(modname) =>
            j-obj([clist:
                obj-field("import-type", j-str("builtin")),
                obj-field("name", j-str(modname))])
          | dependency(protocol, args) =>
            j-obj([clist:
                obj-field("import-type", j-str("dependency")),
                obj-field("protocol", j-str(protocol)),
                obj-field("args", j-list(true, CL.map_list(j-str, args)))])
        end
      end

      the-module = j-fun(J.next-j-fun-id(),
        "_" + sha.sha256(provides.from-uri) + "__direct",
        [clist: const-id("R"), const-id("NAMESPACE"), const-id("M")] + input-ids,
        module-body)
      module-and-map = the-module.to-ugly-sourcemap(provides.from-uri, 1, 1, provides.from-uri)

      [D.string-dict:
        "requires", j-list(true, module-locators-as-js),
        "provides", AL.compile-provides(provides),
        "nativeRequires", j-list(true, cl-empty),
        "theModule",
          if options.collect-all: the-module
          else if options.module-eval == false: j-raw-code(module-and-map.code)
          else: j-str(module-and-map.code) end,
        "theMap", j-str(module-and-map.map)
      ]
  end
end
