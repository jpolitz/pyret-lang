
provide *
provide-types *

import ast as A
import ast-visitors as AV
import srcloc as SL
import file("js-ast.arr") as J
import file("gensym.arr") as G
import file("concat-lists.arr") as CL
import file("js-dag-utils.arr") as DAG
import file("ast-util.arr") as AU
import file("type-structs.arr") as T
import sha as sha
import string-dict as D

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
j-try-catch = J.j-try-catch
j-throw = J.j-throw
j-expr = J.j-expr
j-binop = J.j-binop
j-and = J.j-and
j-or = J.j-or
j-lt = J.j-lt
j-eq = J.j-eq
j-neq = J.j-neq
j-geq = J.j-geq
j-unop = J.j-unop
j-decr = J.j-decr
j-incr = J.j-incr
j-not = J.j-not
j-typeof = J.j-typeof
j-instanceof = J.j-instanceof
j-ternary = J.j-ternary
j-null = J.j-null
j-parens = J.j-parens
j-switch = J.j-switch
j-case = J.j-case
j-default = J.j-default
j-label = J.j-label
j-break = J.j-break
j-continue = J.j-continue
j-while = J.j-while
j-for = J.j-for
j-raw-code = J.j-raw-code


fun make-fun-name(compiler, loc) -> String:
  "_" + sha.sha256(compiler.uri) + "__" + num-to-string(compiler.get-loc-id(loc))
end

type Loc = SL.Srcloc

js-names = A.MakeName(0)
js-ids = D.make-mutable-string-dict()
effective-ids = D.make-mutable-string-dict()
fun fresh-id(id :: A.Name) -> A.Name:
  base-name = if A.is-s-type-global(id): id.tosourcestring() else: id.toname() end
  no-hyphens = string-replace(base-name, "-", "$")
  n = js-names.make-atom(no-hyphens)
  if effective-ids.has-key-now(n.tosourcestring()) block: #awkward name collision!
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
  const-id(string-append("$",id))
end

RUNTIME = j-id(const-id("R"))
NAMESPACE = j-id(const-id("NAMESPACE"))
source-name = j-id(const-id("M"))

rt-name-map = [D.string-dict:
  "addModuleToNamespace", "aMTN",
  "checkArityC", "cAC",
  "checkRefAnns", "cRA",
  "derefField", "dF",
  "getColonFieldLoc", "gCFL",
  "getDotAnn", "gDA",
  "getField", "gF",
  "getFieldRef", "gFR",
  "hasBrand", "hB",
  "isActivationRecord", "isAR",
  "isCont", "isC",
  "isFunction", "isF",
  "isMethod", "isM",
  "isPyretException", "isPE",
  "isPyretTrue", "isPT",
  "makeActivationRecord", "mAR",
  "makeBoolean", "mB",
  "makeBranderAnn", "mBA",
  "makeCont", "mC",
  "makeDataValue", "mDV",
  "makeFunction", "mF",
  "makeGraphableRef", "mGR",
  "makeMatch", "mM",
  "makeMethod", "mMet",
  "makeMethodN", "mMN",
  "makeObject", "mO",
  "makePredAnn", "mPA",
  "makeRecordAnn", "mRA",
  "makeTupleAnn", "mTA",
  "makeVariantConstructor", "mVC",
  "namedBrander", "nB",
  "traceEnter", "tEn",
  "traceErrExit", "tErEx",
  "traceExit", "tEx",
  '_checkAnn', '_cA'
]

fun rt-field(name): j-dot(RUNTIME, name) end

fun rt-method(name, args):
  rt-name = cases(Option) rt-name-map.get(name):
    | none => name
    | some(short-name) => short-name
  end

  j-method(RUNTIME, rt-name, args)
end


fun compile-seq(context, exprs) -> CList<J.JStmt>:
  if is-empty(exprs.rest):
    {compile-expr(context, exprs.first); cl-empty}
  else:
    {_; start-stmts} = compile-expr(context, exprs.first)
    {ans; rest-stmts} = compile-seq(context, exprs.rest)
    {ans; start-stmts + rest-stmts}
  end
end

fun wrap-with-srcnode(l, expr :: J.JExpr):
  cases(Loc) l:
    | builtin(name) => expr
    | srcloc(source, _, _, _, _, _, _) =>
      J.j-sourcenode(l, source, expr)
  end
end

# Use when we're sure the field will exist
fun get-field-unsafe(obj :: J.JExpr, field :: J.JExpr, loc-expr :: J.JExpr):
  rt-method("getFieldLoc", [clist: obj, field, loc-expr])
end

# When the field may not exist, add source mapping so if we can't find it
# we get a useful stacktrace
fun get-field-safe(l, obj :: J.JExpr, field :: J.JExpr, loc-expr :: J.JExpr):
  wrap-with-srcnode(l, get-field-unsafe(obj, field, loc-expr))
end


fun compile-expr(context, expr) -> { J.JExpr; CList<J.JStmt>}:
  cases(A.Expr) expr:
    | s-module(l, answer, dvs, dts, provides, types, checks) =>
      {a-exp; a-stmts} = compile-expr(context, answer)
      
      ans =
        rt-method("makeObject", [clist:
            j-obj([clist:
                j-field("answer", a-exp),
                j-field("namespace", J.j-undefined),
                j-field("locations", j-id(const-id("L"))),
                j-field("defined-values", j-obj(cl-empty)),
                j-field("defined-types", j-obj(cl-empty)),
                j-field("provide-plus-types",
                  rt-method("makeObject", [clist: j-obj([clist:
                          j-field("values", J.j-undefined),
                          j-field("types", J.j-undefined)
                      ])])),
                j-field("checks", J.j-undefined)])])
      {ans; a-stmts}
    | s-srcloc(_, _) => { j-str("a source location"); cl-empty }
    | s-block(l, exprs) => compile-seq(context, exprs)
    | s-num(l, n) => 
      e = if num-is-fixnum(n):
        j-parens(j-num(n))
      else:
        rt-method("makeNumberFromString", [clist: j-str(tostring(n))])
      end
      {e; cl-empty}
    | s-type-let-expr(l, binds, body, _) => compile-expr(context, body)
    | s-let-expr(l, binds, body, _) => compile-expr(context, body)
    | s-letrec(l, binds, body, _) => compile-expr(context, body)
    | s-id(l, id) => {j-id(js-id-of(id)); cl-empty}
    | s-dot(l, obj, field) =>
      { ov; os } = compile-expr(context, obj)
      { get-field-safe(l, ov, j-str(field), j-str("a source location")); os }
    | s-app-enriched(l, f, args, info) =>
      # TODO(joe): Use info
      {fv; fstmts} = compile-expr(context, f)
      {argvs; argstmts} = for fold({argvs; argstmts} from {cl-empty; cl-empty}, a from args):
        {argv; stmts} = compile-expr(context, a)
        {cl-snoc(argvs, argv); argstmts + stmts}
      end
      { j-app(j-dot(fv, "app"), argvs); fstmts + argstmts }
  end
end

fun compile-program(prog, env, provides, options) block:
  {ans; stmts} = compile-expr({
    uri: provides.from-uri,
    options: options,
  }, prog.block)

  globals = D.make-mutable-string-dict()

  fun global-bind(n):
    name = n.toname()
    dep = env.globals.values.get-value(name)
    uri = cases(Option) env.mods.get(dep):
      | some(d) => d.from-uri
      | none => raise(dep + " not found in: " + torepr(env.mods))
    end
    j-var(js-id-of(n),
      j-bracket(
         rt-method("getField", [clist:
              j-bracket(j-dot(RUNTIME, "modules"), j-str(uri)),
              j-str("defined-values")
            ]),
          j-str(name)))
  end

  fun global-type-bind(n):
    name = n.toname()
    dep = env.globals.types.get-value(name)
    uri = cases(Option) env.mods.get(dep):
      | some(d) => d.from-uri
      | none => raise(dep + " not found in: " + torepr(env.mods))
    end
    j-var(js-id-of(n),
      j-bracket(
          rt-method("getField", [clist:
              j-bracket(j-dot(RUNTIME, "modules"), j-str(uri)),
            j-str("defined-types")]),
          j-str(name)))
  end

  var global-bind-dict = D.make-mutable-string-dict()

  collect-globals = AV.default-iter-visitor.{
    method s-id(self, l, name) block:
      when A.is-s-global(name):
        global-bind-dict.set-now(name.toname(), global-bind(name))
      end
      true
    end,
    method a-name(self, l, name) block:
      when A.is-s-global(name):
        global-bind-dict.set-now(name.toname(), global-type-bind(name))
      end
      true
    end
  }
  prog.visit(collect-globals)

  var global-binds = for CL.map_list(k from global-bind-dict.keys-list-now()):
    global-bind-dict.get-value-now(k)
  end

  module-body = J.j-block(global-binds + stmts + [clist: j-return(ans)])

  the-module = j-fun("", "theModule", [clist: RUNTIME.id, NAMESPACE.id, source-name.id], module-body)

  module-and-map = the-module.to-ugly-sourcemap(provides.from-uri, 1, 1, provides.from-uri)

  [D.string-dict:
    "requires", j-list(true, [clist:]),
    "provides", j-obj([clist:]),
    "nativeRequires", j-list(true, [clist:]),
    "theModule", module-and-map.code,
    "theMap", J.j-str(module-and-map.map)
    ]
end



