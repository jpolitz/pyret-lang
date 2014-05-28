#lang pyret

provide *
import ast as A
import parse-pyret as PP
import "compiler/compile-structs.arr" as CS
import string-dict as SD
import either as E

fun ok-last(stmt):
  not(
    A.is-s-let(stmt) or
    A.is-s-var(stmt) or
    A.is-s-fun(stmt) or
    A.is-s-data(stmt) or
    A.is-s-graph(stmt) or
    A.is-s-contract(stmt) or
    A.is-s-check(stmt)
  )
end

fun checkers(l): A.s-app(l, A.s-dot(l, A.s-id(l, A.s-name(l, "builtins")), "current-checker"), [list: ]) end

fun append-nothing-if-necessary(prog :: A.Program) -> Option<A.Program>:
  cases(A.Program) prog:
    | s-program(l1, _provide, headers, body) =>
      cases(A.Expr) body:
        | s-block(l2, stmts) =>
          cases(List) stmts:
            | empty =>
              some(A.s-program(l1, _provide, headers, A.s-block(l2, [list: A.s-id(l2, A.s-name(l2, "nothing"))])))
            | link(_, _) =>
              last-stmt = stmts.last()
              if ok-last(last-stmt): none
              else:
                some(A.s-program(l1, _provide, headers,
                    A.s-block(l2, stmts + [list: A.s-id(l2, A.s-name(l2, "nothing"))])))
              end
          end
        | else => none
      end
  end
end

flatten-single-blocks = A.default-map-visitor.{
    s-block(self, l, stmts):
      if stmts.length() == 1: stmts.first.visit(self)
      else: A.s-block(l, stmts.map(_.visit(self)))
      end
    end
  }

check:
  d = A.dummy-loc
  PP.surface-parse("x", "test").block.visit(flatten-single-blocks).visit(A.dummy-loc-visitor)
    is A.s-id(d, A.s-name(d, "x"))
end

merge-nested-blocks = A.default-map-visitor.{
    s-block(self, l, stmts):
      merged-stmts = for fold(new-stmts from [list: ], s from stmts):
        cases(A.Expr) s.visit(self):
          | s-block(l2, stmts2) => stmts2.reverse() + new-stmts
          | else => [list: s] + new-stmts
        end
      end
      A.s-block(l, merged-stmts.reverse())
    end
  }


fun count-apps(expr):
  var count = 0
  visitor = A.default-iter-visitor.{
      s-app(self, l, f, args):
        count := count + 1
        f.visit(self) and args.map(_.visit(self))
      end
    }
  expr.visit(visitor)
  count
end

data BindingInfo:
  | b-prim(name :: String) # Some "primitive" value supplied by the initial environment
  | b-dict(dict :: SD.StringDict) # Some module supplied by the initial environment
  | b-exp(exp :: A.Expr) # This name is bound to some expression that we can't interpret yet
  | b-dot(base :: BindingInfo, name :: String) # A field lookup off some binding that isn't a b-dict
  | b-typ # A type
  | b-unknown # Any unknown value
end

data Binding:
  | e-bind(loc :: Loc, mut :: Bool, info :: BindingInfo)
end

fun bind-exp(e :: A.Expr, env) -> Option<Binding>:
  cases(A.Expr) e:
    | s-dot(l, o, name) =>
      cases(Option<BindingInfo>) bind-exp(o, env):
        | some(b) =>
          cases(BindingInfo) b:
            | b-dict(dict) =>
              if dict.has-key(name.key()): some(e-bind(A.dummy-loc, false, dict.get(name.key())))
              else: some(e-bind(A.dummy-loc, false, b-dot(b, name)))
              end
            | else => some(e-bind(A.dummy-loc, false, b-dot(b, name)))
          end
        | none => none
      end
    | s-id(_, name) =>
      if env.has-key(name.key()): some(env.get(name.key()))
      else: none
      end
    | s-id-var(_, name) =>
      if env.has-key(name.key()): some(env.get(name.key()))
      else: none
      end
    | s-id-letrec(_, name, _) =>
      if env.has-key(name.key()): some(env.get(name.key()))
      else: none
      end
    | else => some(e-bind(A.dummy-loc, false, b-exp(e)))
  end
end

fun bind-or-unknown(e :: A.Expr, env) -> BindingInfo:
  cases(Option<Binding>) bind-exp(e, env):
    | none => b-unknown
    | some(b) =>
      when not(Binding(b)):
        print-error("b isn't a binding for expr " + torepr(e))
        print-error(b)
      end
      b.info
  end
end

fun binding-type-env-from-env(initial-env):
  for lists.fold(acc from SD.immutable-string-dict(), binding from initial-env.types):
    cases(C.CompileBinding) binding:
      | type-module-bindings(name, ids) =>
        mod = for lists.fold(m from SD.immutable-string-dict(), b from ids):
          m.set(A.s-name(A.dummy-loc, b).key(), e-bind(A.dummy-loc, false, b-typ))
        end
        acc.set(A.s-name(A.dummy-loc, name).key(), e-bind(A.dummy-loc, false, b-dict(mod)))
      | type-id(name) => acc.set(A.s-global(name).key(), e-bind(A.dummy-loc, false, b-typ))
    end
  end
end
fun binding-env-from-env(initial-env):
  for lists.fold(acc from SD.immutable-string-dict(), binding from initial-env.bindings):
    cases(C.CompileBinding) binding:
      | module-bindings(name, ids) =>
        mod = for lists.fold(m from SD.immutable-string-dict(), b from ids):
          m.set(A.s-name(A.dummy-loc, b).key(), e-bind(A.dummy-loc, false, b-prim(name + ":" + b)))
        end
        acc.set(A.s-name(A.dummy-loc, name).key(), e-bind(A.dummy-loc, false, b-dict(mod)))
      | builtin-id(name) => acc.set(A.s-global(name).key(), e-bind(A.dummy-loc, false, b-prim(name)))
    end
  end
end

fun <a, c> default-env-map-visitor(
    initial-env :: a,
    initial-type-env :: b,
    bind-handlers :: {
        s-letrec-bind :: (A.LetrecBind, a -> a),
        s-let-bind :: (A.LetBind, a -> a),
        s-bind :: (A.Bind, a -> a),
        s-header :: (A.Header, a, c -> { val-env :: a, type-env :: c }),
        s-type-bind :: (A.TypeLetBind, a, c -> { val-env :: a, type-env :: c })
      }
    ):
  A.default-map-visitor.{
    env: initial-env,
    type-env: initial-type-env,

    s-program(self, l, _provide, imports, body):
      visit-provide = _provide.visit(self)
      visit-imports = for map(i from imports):
        i.visit(self)
      end
      new-envs = { val-env: self.env, type-env: self.type-env }
      imported-envs = for fold(acc from new-envs, i from visit-imports):
        bind-handlers.s-header(i, acc.val-env, acc.type-env)
      end
      visit-body = body.visit(self.{env: imported-envs.val-env, type-env: imported-envs.type-env })
      A.s-program(l, visit-provide, visit-imports, visit-body)
    end,
    s-type-let-expr(self, l, binds, body):
      new-envs = { val-env: self.env, type-env: self.type-env }
      bound-env = for lists.fold(acc from new-envs.{ bs: [list: ] }, b from binds):
        updated = bind-handlers.s-type-let-bind(b, acc.val-env, acc.type-env)
        visit-envs = self.{ env: updated.val-env, type-env: updated.type-env }
        new-bind = b.visit(visit-envs)
        updated.{ bs: link(new-bind, acc.bs) }
      end
      A.s-type-let-expr(l, bound-env.bs, body.visit(self.{ env: bound-env.val-env, type-env: bound-env.type-env }))
    end,
    s-let-expr(self, l, binds, body):
      bound-env = for fold(acc from { e: self.env, bs : [list: ] }, b from binds):
        new-bind = b.visit(self.{env : acc.e})
        this-env = bind-handlers.s-let-bind(new-bind, acc.e)
        {
          e: this-env,
          bs: link(new-bind, acc.bs)
        }
      end
      visit-binds = bound-env.bs.reverse()
      visit-body = body.visit(self.{env: bound-env.e})
      A.s-let-expr(l, visit-binds, visit-body)
    end,
    s-letrec(self, l, binds, body):
      bind-env = for fold(acc from self.env, b from binds):
        bind-handlers.s-letrec-bind(b, acc)
      end
      new-visitor = self.{env: bind-env}
      visit-binds = binds.map(_.visit(new-visitor))
      visit-body = body.visit(new-visitor)
      A.s-letrec(l, visit-binds, visit-body)
    end,
    s-lam(self, l, params, args, ann, doc, body, _check):
      new-args = args.map(_.visit(self))
      args-env = for lists.fold(acc from self.env, new-arg from args):
        bind-handlers.s-bind(new-arg, acc)
      end
      new-body = body.visit(self.{env: args-env})
      new-check = self.{env: args-env}.option(_check)
      A.s-lam(l, params, new-args, ann.visit(self.{env: args-env}), doc, new-body, new-check)
    end,
    s-method(self, l, args, ann, doc, body, _check):
      new-args = args.map(_.visit(self))
      args-env = for lists.fold(acc from self.env, arg from new-args):
        bind-handlers.s-bind(arg, acc)
      end
      new-body = body.visit(self.{env: args-env})
      new-check = self.{env: args-env}.option(_check)
      A.s-method(l, new-args, ann.visit(self.{env: args-env}), doc, new-body, new-check)
    end
  }
end


fun <a, c> default-env-iter-visitor(
    initial-env :: a,
    initial-type-env :: c,
    bind-handlers :: {
        s-letrec-bind :: (A.LetrecBind, a -> a),
        s-let-bind :: (A.LetBind, a -> a),
        s-bind :: (A.Bind, a -> a),
        s-header :: (A.Header, a, c -> { val-env :: a, type-env :: c }),
        s-type-bind :: (A.TypeLetBind, a, c -> { val-env :: a, type-env :: c })
      }
    ):
  A.default-iter-visitor.{
    env: initial-env,
    type-env: initial-type-env,

    s-program(self, l, _provide, imports, body):
      if _provide.visit(self):
        new-envs = { val-env: self.env, type-env: self.type-env }
        imported-envs = for fold(acc from new-envs, i from imports):
          bind-handlers.s-header(i, acc.val-env, acc.type-env)
        end
        new-visitor = self.{ env: imported-envs.val-env, type-env: imported-envs.type-env }
        lists.all(_.visit(new-visitor), imports) and body.visit(new-visitor)
      else:
        false
      end
    end,
    s-type-let-expr(self, l, binds, body):
      new-envs = { val-env: self.env, type-env: self.type-env }
      bound-env = for lists.fold-while(acc from new-envs.{ bs: true }, b from binds):
        updated = bind-handlers.s-type-let-bind(b, acc.val-env, acc.type-env)
        visit-envs = self.{ env: updated.val-env, type-env: updated.type-env }
        new-bind = b.visit(visit-envs)
        if new-bind:
          E.left(updated.{ bs: true })
        else:
          E.right(updated.{ bs: false})
        end
      end
      bound-env.bs and body.visit(self.{ env: bound-env.val-env, type-env: bound-env.type-env })
    end,
    s-let-expr(self, l, binds, body):
      bound-env = for lists.fold-while(acc from { e: self.env, bs: true }, b from binds):
        this-env = bind-handlers.s-let-bind(b, acc.e)
        new-bind = b.visit(self.{env : acc.e})
        if new-bind:
          E.left({ e: this-env, bs: true })
        else:
          E.right({ e: this-env, bs: false })
        end
      end
      bound-env.bs and body.visit(self.{env: bound-env.e})
    end,
    s-letrec(self, l, binds, body):
      bind-env = for lists.fold(acc from self.env, b from binds):
        bind-handlers.s-letrec-bind(b, acc)
      end
      new-visitor = self.{env: bind-env}
      continue-binds = for lists.fold-while(acc from true, b from binds):
        if b.visit(new-visitor): E.left(true) else: E.right(false) end
      end
      continue-binds and body.visit(new-visitor)
    end,
    s-lam(self, l, params, args, ann, doc, body, _check):
      args-env = for lists.fold(acc from self.env, arg from args):
        bind-handlers.s-bind(arg, acc)
      end
      lists.all(_.visit(self), args) and
        ann.visit(self.{env: args-env}) and
        body.visit(self.{env: args-env}) and
        self.{env: args-env}.option(_check)
    end,
    s-method(self, l, args, ann, doc, body, _check):
      args-env = for lists.fold(acc from self.env, arg from args):
        bind-handlers.s-bind(arg, acc)
      end
      lists.all(_.visit(self), args) and
        ann.visit(self.{env: args-env}) and
        body.visit(self.{env: args-env}) and
        self.{env: args-env}.option(_check)
    end
  }
end

binding-handlers = {
  s-header(_, imp, env, type-env):
    {
      val-env: env.set(imp.name.key(), e-bind(imp.l, false, b-unknown)),
      type-env: type-env.set(imp.name.key(), e-bind(imp.l, false, b-typ))
    }
  end,
  s-type-let-bind(_, tlb, env, type-env):
    cases(A.TypeLetBind) tlb:
      | s-type-bind(l, name, ann) =>
        {
          val-env: env,
          type-env: type-env.set(name.key(), e-bind(l, false, b-typ))
        }
      | s-newtype-bind(l, tname, bname) =>
        {
          val-env: env.set(bname.key(), e-bind(l, false, b-unknown)),
          type-env: type-env.set(tname.key(), e-bind(l, false, b-typ))
        }
    end
  end,
  s-let-bind(_, lb, env):
    cases(A.LetBind) lb:
      | s-let-bind(l2, bind, val) =>
        env.set(bind.id.key(), e-bind(l2, false, bind-or-unknown(val, env)))
      | s-var-bind(l2, bind, val) =>
        env.set(bind.id.key(), e-bind(l2, true, b-unknown))
    end
  end,
  s-letrec-bind(_, lrb, env):
    env.set(lrb.b.id.key(),
      e-bind(lrb.l, false, bind-or-unknown(lrb.value, env)))
  end,
  s-bind(_, b, env):
    env.set(b.id.key(), e-bind(b.l, false, b-unknown))
  end
}
fun binding-env-map-visitor(initial-env):
  default-env-map-visitor(binding-env-from-env(initial-env), binding-type-env-from-env(initial-env), binding-handlers)
end
fun binding-env-iter-visitor(initial-env):
  default-env-iter-visitor(binding-env-from-env(initial-env), binding-type-env-from-env(initial-env), binding-handlers)
end

fun link-list-visitor(initial-env):
  binding-env-map-visitor(initial-env).{
    s-app(self, l, f, args):
      if A.is-s-dot(f) and (f.field == "_plus"):
        target = f.obj
        cases(A.Expr) target:
          | s-app(l2, lnk, _args) =>
            cases(BindingInfo) bind-or-unknown(lnk, self.env):
              | b-prim(n) =>
                if n == "list:link":
                  A.s-app(l2, lnk, [list: _args.first,
                      A.s-app(l, A.s-dot(f.l, _args.rest.first, f.field), args).visit(self)]) 
                else if n == "list:empty":
                  args.first.visit(self)
                else:
                  A.s-app(l, f.visit(self), args.map(_.visit(self)))
                end
              | else =>
                A.s-app(l, f.visit(self), args.map(_.visit(self)))
            end
          | s-id(_, _) =>
            cases(BindingInfo) bind-or-unknown(target, self.env):
              | b-prim(name) =>
                if (name == "list:empty"):
                  args.first.visit(self)
                else:
                  A.s-app(l, f.visit(self), args.map(_.visit(self)))
                end
              | else =>
                A.s-app(l, f.visit(self), args.map(_.visit(self)))
            end
          | s-dot(_, _, _) =>
            cases(BindingInfo) bind-or-unknown(target, self.env):
              | b-prim(name) =>
                if (name == "list:empty"):
                  args.first.visit(self)
                else:
                  A.s-app(l, f.visit(self), args.map(_.visit(self)))
                end
              | else =>
                A.s-app(l, f.visit(self), args.map(_.visit(self)))
            end
          | else =>
            A.s-app(l, f.visit(self), args.map(_.visit(self)))
        end
      else:
        A.s-app(l, f.visit(self), args.map(_.visit(self)))
      end
    end
  }
end

fun bad-assignments(initial-env, ast):
  var errors = [list: ] # THE MUTABLE LIST OF ERRORS
  fun add-error(err): errors := err ^ link(_, errors) end
  ast.visit(binding-env-iter-visitor(initial-env).{
    s-assign(self, loc, id, value):
      cases(Option<Binding>) bind-exp(A.s-id(loc, id), self.env):
        | none => nothing
        | some(b) =>
          when not(b.mut):
            add-error(CS.bad-assignment(id.toname(), loc, b.loc))
          end
      end
      value.visit(self)
    end,
  })
  errors
end

inline-lams = A.default-map-visitor.{
  s-app(self, loc, f, exps):
    cases(A.Expr) f:
      | s-lam(l, _, args, _, _, body, _) =>
        let-binds = for lists.map2(arg from args, exp from exps):
          A.s-let-bind(arg.l, arg, exp.visit(self))
        end
        A.s-let-expr(l, let-binds, body)
      | else => A.s-app(loc, f.visit(self), exps.map(_.visit(self)))
    end
  end
}

fun check-unbound(initial-env, ast):
  var errors = [list: ] # THE MUTABLE LIST OF UNBOUND IDS
  fun add-error(err): errors := err ^ link(_, errors) end
  fun handle-id(this-id, env):
    when is-none(bind-exp(this-id, env)):
      add-error(CS.unbound-id(this-id))
    end
  end
  fun handle-type-id(ann, env):
    when not(env.has-key(ann.id.key())):
      add-error(CS.unbound-type-id(ann))
    end
  end
  ast.visit(binding-env-iter-visitor(initial-env).{
      s-id(self, loc, id):
        handle-id(A.s-id(loc, id), self.env)
        true
      end,
      s-id-var(self, loc, id):
        handle-id(A.s-id-var(loc, id), self.env)
        true
      end,
      s-id-letrec(self, loc, id, safe):
        handle-id(A.s-id-letrec(loc, id, safe), self.env)
        true
      end,
      s-assign(self, loc, id, value):
        when is-none(bind-exp(A.s-id(loc, id), self.env)):
          add-error(CS.unbound-var(id.toname(), loc))
        end
        value.visit(self)
      end,
      a-name(self, loc, id):
        handle-type-id(A.a-name(loc, id), self.type-env)
        true
      end,
      a-dot(self, loc, name, field):
        handle-type-id(A.a-name(loc, name), self.type-env)
        true
      end
    })
  errors
where:
  p = PP.surface-parse(_, "test")
  unbound1 = check-unbound(CS.no-builtins, p("x"))
  unbound1.length() is 1

end

fun value-delays-exec-of(name, expr):
  A.is-s-lam(expr) or A.is-s-method(expr)
end

letrec-visitor = A.default-map-visitor.{
  env: SD.immutable-string-dict(),
  s-letrec(self, l, binds, body):
    bind-envs = for map2(b1 from binds, i from range(0, binds.length())):
      rhs-is-delayed = value-delays-exec-of(b1.b.id, b1.value)
      for fold2(acc from self.env, b2 from binds, j from range(0, binds.length())):
        key = b2.b.id.key()
        if i < j:
          acc.set(key, false)
        else if i == j:
          acc.set(key, rhs-is-delayed)
        else:
          acc.set(key, true)
        end
      end
    end
    new-binds = for map2(b from binds, bind-env from bind-envs):
      b.visit(self.{ env: bind-env })
    end
    body-env = bind-envs.last().set(binds.last().b.id.key(), true)
    new-body = body.visit(self.{ env: body-env })
    A.s-letrec(l, new-binds, new-body)
  end,
  s-id-letrec(self, l, id, _):
    A.s-id-letrec(l, id, self.env.get(id.key()))
  end
}

