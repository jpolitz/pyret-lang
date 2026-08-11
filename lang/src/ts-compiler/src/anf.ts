/*
  TS port of src/arr/compiler/anf.arr (the A-normalization pass).
  See CONVENTIONS.md.

  Continuations (the ANFCont type and the `k` parameters threaded through
  `anf`/`anf-name`/`anf-name-rec`/...) are ported directly as TS closures:
  Pyret's `(N.ALettable -> N.AExpr)` becomes
  `(lettable: N.ALettable) => N.AExpr`. Call order is preserved exactly so
  gensym-generated names (`anf_...`) match the Pyret compiler's output.
*/

import * as A from './ast';
import * as SL from './srcloc';
import * as N from './ast-anf';
import { InternalCompilerError, raise, map2, toRepr as torepr, field, asVariant } from './shared';
import { jsnums, PyretNumber, throwingErrbacks } from './interop/js-numbers';

export type Loc = SL.Srcloc;

export type ANFCont = (lettable: N.ALettable) => N.AExpr;

export function getValue(o: any): A.Expr { return o.value; }

export const names = A.globalNames;
export const flatPrimApp = new A.PrimAppInfoC(false);

export function mkId(loc: N.Loc, base: string): { id: A.Name; idB: N.ABind; idE: N.AId } {
  const t = names.makeAtom(base);
  return { id: t, idB: bind(loc, t), idE: new N.AId(loc, t) };
}

export function anfTerm(e: A.Expr): N.AExpr {
  return anf(e, (x) => new N.ALettable(x.l, x));
}

export function bind(l: N.Loc, id: A.Name): N.ABind {
  return new N.ABind(l, id, A.aBlank);
}

export function anfBind(b: A.Bind): N.ABind {
  switch (b.$name) {
    case 's-bind':
      return new N.ABind(b.l, b.id, b.ann);
    default:
      throw new InternalCompilerError('No case matched in anfBind: ' + b.$name);
  }
}

export function anfCasesBind(cb: A.CasesBind): N.ACasesBind {
  switch (cb.$name) {
    case 's-cases-bind':
      return new N.ACasesBind(cb.l, cb.fieldType, anfBind(cb.bind));
    default:
      throw new InternalCompilerError('No case matched in anfCasesBind: ' + (cb as any).$name);
  }
}

export function anfCasesBranch(branch: A.CasesBranch): N.ACasesBranch {
  switch (branch.$name) {
    case 's-cases-branch':
      return new N.ACasesBranch(branch.l, branch.patLoc, branch.name,
        branch.args.map(anfCasesBind), anfTerm(branch.body));
    case 's-singleton-cases-branch':
      return new N.ASingletonCasesBranch(branch.l, branch.patLoc, branch.name, anfTerm(branch.body));
    default:
      throw new InternalCompilerError('No case matched in anfCasesBranch: ' + (branch as any).$name);
  }
}

export function anfName(expr: A.Expr, nameHint: string, k: (v: N.AVal) => N.AExpr): N.AExpr {
  return anf(expr, (lettable) => {
    if (N.isAVal(lettable)) {
      return k(lettable.v);
    } else {
      const t = mkId(expr.l, nameHint);
      return new N.ALet(expr.l, t.idB, lettable, k(t.idE));
    }
  });
}

/*
  Iterative version of the natural recursion (which nests one whole anf()
  activation per element and overflows fixed-size stacks on long lists —
  e.g. a module's defined values, which are one identifier per top-level
  definition). Elements are translated left-to-right, exactly as in the
  recursive formulation, so gensym-generated names are identical.

  Each element's continuation is single-shot and its result becomes the
  tail of that element's translation, so instead of translating the rest
  of the list inside the continuation, the continuation returns a node
  with a placeholder tail that the next element's translation (and
  finally k's result) is patched into — the same technique as
  anfNameArrRec/anfLinear. Two shapes arise:

  - the element needs a name: build its ALet here, exactly as anfName
    would, with the body as the placeholder;
  - the element ANFs directly to a value (no generated name, no
    wrapper): return a fresh placeholder node. Usually anf() hands it
    straight back (the element contributes no nodes at all, and the
    previous element's pending patch stays where it is); but when the
    value sits at the end of a statement spine (e.g. a block whose last
    expression is a literal), anf() embeds the placeholder in the
    spine's tail position, where tailPatcher finds it.
*/
export function anfNameRec(
  exprs: A.Expr[],
  nameHint: string,
  k: (vs: N.AVal[]) => N.AExpr
): N.AExpr {
  const vs: N.AVal[] = [];
  let result: N.AExpr | undefined = undefined;
  let patch: ((rest: N.AExpr) => void) | undefined = undefined;
  const emit = (translated: N.AExpr, nextPatch: (rest: N.AExpr) => void): void => {
    if (result === undefined) {
      result = translated;
    } else {
      patch!(translated);
    }
    patch = nextPatch;
  };
  for (const f of exprs) {
    let hole: N.ALet | undefined = undefined;
    let placeholder: N.AExpr | undefined = undefined;
    const translated = anf(f, (lettable) => {
      if (N.isAVal(lettable)) {
        vs.push(lettable.v);
        placeholder = new N.ALettable(lettable.l, lettable);
        return placeholder;
      } else {
        const t = mkId(f.l, nameHint);
        vs.push(t.idE);
        hole = new N.ALet(f.l, t.idB, lettable, undefined as unknown as N.AExpr);
        return hole;
      }
    });
    if (hole !== undefined) {
      const h: N.ALet = hole;
      emit(translated, (rest) => { h.body = rest; });
    } else if (placeholder !== undefined) {
      if (translated !== placeholder) {
        emit(translated, tailPatcher(translated, placeholder));
      }
    } else {
      throw new InternalCompilerError('anfNameRec: element continuation was not invoked: ' + f.$name);
    }
  }
  const tail = k(vs);
  if (result === undefined) {
    return tail;
  }
  patch!(tail);
  return result;
}

// Find `placeholder` in a tail position of `root` and return the patch
// that replaces it. anf() only ever embeds a continuation's result in
// the tail of the spine wrappers below; anything else is ill-formed.
function tailPatcher(root: N.AExpr, placeholder: N.AExpr): (rest: N.AExpr) => void {
  let cur: N.AExpr = root;
  for (;;) {
    switch (cur.$name) {
      case 'a-type-let':
      case 'a-let':
      case 'a-arr-let':
      case 'a-var': {
        const node = cur;
        if (node.body === placeholder) {
          return (rest) => { node.body = rest; };
        }
        cur = node.body;
        break;
      }
      case 'a-seq': {
        const node = cur;
        if (node.e2 === placeholder) {
          return (rest) => { node.e2 = rest; };
        }
        cur = node.e2;
        break;
      }
      default:
        throw new InternalCompilerError('anfNameRec: continuation result not in a tail position: ' + cur.$name);
    }
  }
}

export function anfNameArr(expr: A.Expr, name: A.Name, idx: number, k: () => N.AExpr): N.AExpr {
  return anf(expr, (lettable) =>
    new N.AArrLet(expr.l, new N.ABind(expr.l, name, A.aBlank), idx, lettable, k()));
}

export function anfNameArrRec(
  exprs: A.Expr[],
  name: A.Name,
  ind: number,
  k: () => N.AExpr
): N.AExpr {
  // Iterative version of the natural recursion (which nests one anf()
  // activation per element and overflows fixed-size stacks on long array
  // literals): each element's AArrLet is built with a placeholder body,
  // patched once the next element is translated. Continuations are
  // single-shot and translation happens in the original order.
  if (exprs.length === 0) {
    return k();
  }
  let result: N.AExpr | undefined = undefined;
  let patch: ((rest: N.AExpr) => void) | undefined = undefined;
  for (let i = 0; i < exprs.length; i++) {
    const f = exprs[i];
    let hole: N.AArrLet | undefined = undefined;
    const translated = anf(f, (lettable) => {
      hole = new N.AArrLet(f.l, new N.ABind(f.l, name, A.aBlank), ind + i, lettable,
        undefined as unknown as N.AExpr);
      return hole;
    });
    if (hole === undefined) {
      throw new InternalCompilerError('anfNameArrRec: element continuation was not invoked');
    }
    const h: N.AArrLet = hole;
    if (result === undefined) {
      result = translated;
    } else {
      patch!(translated);
    }
    patch = (rest: N.AExpr) => { h.body = rest; };
  }
  patch!(k());
  return result!;
}

export function anfProgram(e: A.Program): N.AProg {
  switch (e.$name) {
    case 's-program':
      // Note: provides have been desugared to a structure with no expressions, just
      // names and Ann information
      // MARK(joe/ben): provides
      return new N.AProgram(e.l, e.provides[0], e.imports, anfTerm(e.block));
    default:
      throw new InternalCompilerError('No case matched in anfProgram: ' + (e as any).$name);
  }
}

export function anfBlock(esInit: A.Expr[], k: ANFCont): N.AExpr {
  if (esInit.length === 0) {
    return raise('Empty block');
  }
  return anfLinear(new A.SBlock(esInit[0].l, esInit), k);
}

/*
  Iterative translation of the program's "linear spine".

  After scope resolution a program is a deeply right-nested alternation of
  s-block / s-let-expr / s-type-let-expr / s-letrec: each binding's body
  contains the entire rest of the program. The natural CPS formulation
  nests one whole anf() activation per statement/binding, which overflows
  fixed-size stacks (e.g. browsers, where the CLI's --stack-size escape
  hatch does not exist) on long programs.

  The continuations involved are single-shot, so the spine can be walked
  with a loop instead: each step translates one statement or binding,
  building its ALet/AVar/ASeq/ATypeLet wrapper with a placeholder
  body/tail that is patched once the next step is translated. anf()'s
  only side effect is gensym, and every translation below happens in the
  same order as in the recursive formulation, so generated names are
  identical.
*/
function anfLinear(eInit: A.Expr, k: ANFCont): N.AExpr {
  let result: N.AExpr | undefined = undefined;
  let patch: ((rest: N.AExpr) => void) | undefined = undefined;

  function emit(translated: N.AExpr, nextPatch: (rest: N.AExpr) => void): void {
    if (result === undefined) {
      result = translated;
    } else {
      patch!(translated);
    }
    patch = nextPatch;
  }

  function finish(translated: N.AExpr): N.AExpr {
    if (result === undefined) {
      return translated;
    }
    patch!(translated);
    return result;
  }

  let e: A.Expr = eInit;
  for (;;) {
    switch (e.$name) {
      case 's-block': {
        const stmts = e.stmts;
        if (stmts.length === 0) {
          return raise('Empty block');
        }
        // Note: assuming blocks don't end in let/var here
        for (let i = 0; i < stmts.length - 1; i++) {
          const f = stmts[i];
          let hole: N.ASeq | undefined = undefined;
          const translated = anf(f, (lettable) => {
            hole = new N.ASeq(f.l, lettable, undefined as unknown as N.AExpr);
            return hole;
          });
          if (hole === undefined) {
            throw new InternalCompilerError('anfLinear: statement continuation was not invoked');
          }
          const h: N.ASeq = hole;
          emit(translated, (rest) => { h.e2 = rest; });
        }
        e = stmts[stmts.length - 1];
        continue;
      }
      case 's-type-let-expr': {
        const { l, binds, body } = e;
        for (const f of binds) {
          let newBind: N.ATypeBind;
          switch (f.$name) {
            case 's-type-bind':
              newBind = new N.ATypeBind(f.l, f.name, f.ann); // TODO(MATT): is this going to have to change?
              break;
            case 's-newtype-bind':
              newBind = new N.ANewtypeBind(f.l, f.name, f.namet);
              break;
            default:
              throw new InternalCompilerError('No case matched in anf s-type-let-expr: ' + (f as any).$name);
          }
          const node = new N.ATypeLet(l, newBind, undefined as unknown as N.AExpr);
          emit(node, (rest) => { node.body = rest; });
        }
        e = body;
        continue;
      }
      case 's-let-expr': {
        const { l, binds, body } = e;
        for (const f of binds) {
          switch (f.$name) {
            case 's-var-bind': {
              const l2 = f.l;
              const b = asVariant(f.b, A.SBind);
              const val = f.value;
              if (A.isABlank(b.ann) || A.isAAny(b.ann)) {
                let hole: N.AVar | undefined = undefined;
                const translated = anfName(val, 'var', (newVal) => {
                  hole = new N.AVar(l2, new N.ABind(l2, b.id, b.ann), new N.AVal(newVal.l, newVal),
                    undefined as unknown as N.AExpr);
                  return hole;
                });
                if (hole === undefined) {
                  throw new InternalCompilerError('anfLinear: var-bind continuation was not invoked');
                }
                const h: N.AVar = hole;
                emit(translated, (rest) => { h.body = rest; });
              } else {
                const varName = mkId(l2, 'var');
                let hole: N.AVar | undefined = undefined;
                const translated = anf(val, (lettable) => {
                  hole = new N.AVar(l2, new N.ABind(l2, b.id, b.ann), new N.AVal(l2, varName.idE),
                    undefined as unknown as N.AExpr);
                  return new N.ALet(l2, varName.idB, lettable, hole);
                });
                if (hole === undefined) {
                  throw new InternalCompilerError('anfLinear: annotated var-bind continuation was not invoked');
                }
                const h: N.AVar = hole;
                emit(translated, (rest) => { h.body = rest; });
              }
              break;
            }
            case 's-let-bind': {
              const l2 = f.l;
              const b = asVariant(f.b, A.SBind);
              const val = f.value;
              let hole: N.ALet | undefined = undefined;
              const translated = anf(val, (lettable) => {
                hole = new N.ALet(l2, new N.ABind(l2, b.id, b.ann), lettable,
                  undefined as unknown as N.AExpr);
                return hole;
              });
              if (hole === undefined) {
                throw new InternalCompilerError('anfLinear: let-bind continuation was not invoked');
              }
              const h: N.ALet = hole;
              emit(translated, (rest) => { h.body = rest; });
              break;
            }
            default:
              throw new InternalCompilerError('No case matched in anf s-let-expr: ' + (f as any).$name);
          }
        }
        e = body;
        continue;
      }
      case 's-letrec': {
        const { l, binds, body } = e;
        const letBinds = binds.map((b) =>
          new A.SVarBind(b.l, b.b, new A.SUndefined(l)));
        const assigns = binds.map((b): A.Expr =>
          new A.SAssign(b.l, field(b.b, 'id'), b.value));
        e = new A.SLetExpr(l, letBinds, new A.SBlock(l, [...assigns, body]), true);
        continue;
      }
      default:
        return finish(anf(e, k));
    }
  }
}

export function anf(e: A.Expr, k: ANFCont): N.AExpr {
  switch (e.$name) {
    case 's-module': {
      const l = e.l;
      const adms = e.definedModules.map((dm) =>
        new N.ADefinedModule(dm.name, dm.value, dm.uri));
      const adts = e.definedTypes.map((dt) =>
        new N.ADefinedType(dt.name, dt.typ));
      const needsValue = e.definedValues.filter(A.isSDefinedValue);
      return anfNameRec(needsValue.map(getValue), 'defined_value', (advs0) => {
        const advs = map2((name: string, adv: N.AVal): N.ADefinedValue =>
          new N.ADefinedValue(name, adv), needsValue.map((dv) => dv.name), advs0);
        const avars = e.definedValues.filter(A.isSDefinedVar).map((dvar) =>
          new N.ADefinedVar(dvar.name, dvar.id));

        return anfName(e.answer, 'answer', (ans) =>
          anfName(e.checks, 'checks', (chks) =>
            k(new N.AModule(l, ans, adms, [...advs, ...avars], adts, chks))));
      });
    }
    case 's-num':
      return k(new N.AVal(e.l, new N.ANum(e.l, e.n)));
    // num, den are exact ints, and s-frac desugars to the exact rational num/den
    case 's-frac': // Possibly unneeded if removed by desugar?
      return k(new N.AVal(e.l, new N.ANum(e.l, jsnums.divide(e.num, e.den, throwingErrbacks))));
    // num, den are exact ints, and s-rfrac desugars to the roughnum fraction corresponding to num/den
    case 's-rfrac': // Possibly unneeded if removed by desugar?
      return k(new N.AVal(e.l, new N.ANum(e.l,
        jsnums.toRoughnum(jsnums.divide(e.num, e.den, throwingErrbacks), throwingErrbacks))));
    case 's-str':
      return k(new N.AVal(e.l, new N.AStr(e.l, e.s)));
    case 's-undefined':
      return k(new N.AVal(e.l, new N.AUndefined(e.l)));
    case 's-bool':
      return k(new N.AVal(e.l, new N.ABool(e.l, e.b)));
    case 's-prim-val':
      return k(new N.AVal(e.l, new N.APrimVal(e.l, e.name)));
    case 's-id':
      return k(new N.AVal(e.l, new N.AId(e.l, e.id)));
    case 's-id-modref':
      return k(new N.AVal(e.l, new N.AIdModref(e.l, e.id, e.uri, e.name)));
    case 's-id-var-modref':
      return k(new N.AIdVarModref(e.l, e.id, e.uri, e.name));
    case 's-srcloc':
      return k(new N.AVal(e.l, new N.ASrcloc(e.l, e.loc)));
    // The linear-spine shapes (deeply right-nested after scope resolution)
    // are translated iteratively to keep stack depth bounded; see anfLinear.
    case 's-type-let-expr':
    case 's-let-expr':
    case 's-letrec':
      return anfLinear(e, k);

    case 's-data-expr': {
      const l = e.l;
      const dataName = e.name;
      const dataNameT = e.namet;
      const variants = e.variants;
      const shared = e.sharedMembers;
      function anfMember(member: A.VariantMember): N.AVariantMember {
        switch (member.$name) {
          case 's-variant-member': {
            const l2 = member.l;
            const typ = member.memberType;
            const b = member.bind;
            let aType: N.AMemberType;
            switch (typ.$name) {
              case 's-normal':
                aType = new N.ANormal();
                break;
              case 's-mutable':
                aType = new N.AMutable();
                break;
              default:
                throw new InternalCompilerError('No case matched in anfMember member type: ' + (typ as any).$name);
            }
            let newBind: N.ABind;
            switch (b.$name) {
              case 's-bind':
                newBind = new N.ABind(b.l, b.id, b.ann);
                break;
              default:
                throw new InternalCompilerError('No case matched in anfMember bind: ' + (b as any).$name);
            }
            return new N.AVariantMember(l2, aType, newBind);
          }
          default:
            throw new InternalCompilerError('No case matched in anfMember: ' + (member as any).$name);
        }
      }
      function anfVariant(v: A.Variant, kv: (av: N.AVariant) => N.AExpr): N.AExpr {
        switch (v.$name) {
          case 's-variant': {
            const withExprs = v.withMembers.map(getValue);
            return anfNameRec(withExprs, 'anf_variant_member', (ts) => {
              const newFields = map2((f: A.Member, t: N.AVal): N.AField =>
                new N.AField(f.l, field(f, 'name'), t), v.withMembers, ts);
              return kv(new N.AVariant(v.l, v.constrLoc, v.name, v.members.map(anfMember), newFields));
            });
          }
          case 's-singleton-variant': {
            const withExprs = v.withMembers.map(getValue);
            return anfNameRec(withExprs, 'anf_singleton_variant_member', (ts) => {
              const newFields = map2((f: A.Member, t: N.AVal): N.AField =>
                new N.AField(f.l, field(f, 'name'), t), v.withMembers, ts);
              return kv(new N.ASingletonVariant(v.l, v.name, newFields));
            });
          }
          default:
            throw new InternalCompilerError('No case matched in anfVariant: ' + (v as any).$name);
        }
      }
      // Iterative for the same reason as anfNameRec (the natural
      // recursion nests one frame set per variant): each variant's
      // continuation returns a placeholder for the rest, patched when
      // the next variant is translated; ks still runs after every
      // variant. A variant with no named with-members contributes no
      // nodes, exactly as in the recursive formulation.
      function anfVariants(vs: A.Variant[], ks: (avs: N.AVariant[]) => N.AExpr): N.AExpr {
        const avs: N.AVariant[] = [];
        let result: N.AExpr | undefined = undefined;
        let patch: ((rest: N.AExpr) => void) | undefined = undefined;
        for (const f of vs) {
          let placeholder: N.AExpr | undefined = undefined;
          const translated = anfVariant(f, (av) => {
            avs.push(av);
            placeholder = new N.ALettable(f.l, new N.AVal(f.l, new N.AUndefined(f.l)));
            return placeholder;
          });
          if (placeholder === undefined) {
            throw new InternalCompilerError('anf s-data-expr: variant continuation was not invoked');
          }
          if (translated !== placeholder) {
            const nextPatch = tailPatcher(translated, placeholder);
            if (result === undefined) {
              result = translated;
            } else {
              patch!(translated);
            }
            patch = nextPatch;
          }
        }
        const tail = ks(avs);
        if (result === undefined) {
          return tail;
        }
        patch!(tail);
        return result;
      }
      const exprs = shared.map(getValue);

      return anfNameRec(exprs, 'anf_shared', (ts) => {
        const newShared = map2((f: A.Member, t: N.AVal): N.AField =>
          new N.AField(f.l, field(f, 'name'), t), shared, ts);
        return anfVariants(variants, (newVariants) =>
          k(new N.ADataExpr(l, dataName, dataNameT, newVariants, newShared)));
      });
    }

    case 's-if-else': {
      /*
        Iterative version of the natural recursion, which nests one
        anfName activation per arm and overflows fixed-size stacks on
        long `ask`/`if-else-if` chains. Note the arms of a chain are
        NOT one branch list by the time they reach this pass: desugarIf
        rewrites an N-arm if into N right-nested single-branch
        s-if-else nodes, so this walks both a node's branch list and
        the chain of s-if-else nodes in else position. Each arm's AIf
        is built with a placeholder else-slot, patched when the next
        arm is translated. Arm tests and bodies are translated in the
        original order, and k still runs after every arm; its result
        replaces the placeholder standing where the recursive
        formulation embedded it (inside the first arm's translation).
      */
      let node = e;
      let result: N.AExpr | undefined = undefined;
      let kPlaceholder: N.AExpr | undefined = undefined;
      let firstIf: N.AIf | undefined = undefined;
      let prevIf: N.AIf | undefined = undefined;
      let isFirst = true;
      for (;;) {
        const { l, branches, _else } = node;
        if (branches.length === 0) {
          return raise('Empty branches');
        }
        const elseIsIf = _else.$name === 's-if-else';
        for (let i = 0; i < branches.length; i++) {
          const f = branches[i];
          const first = isFirst;
          const isLastArm = (i === branches.length - 1) && !elseIsIf;
          let aif: N.AIf | undefined = undefined;
          const translated = anfName(f.test, 'anf_if', (test) => {
            aif = new N.AIf(l, test, anfTerm(f.body),
              isLastArm ? anfTerm(_else) : (undefined as unknown as N.AExpr));
            const wrapped = new N.ALettable(l, aif);
            if (first) {
              kPlaceholder = wrapped;
            }
            return wrapped;
          });
          if (aif === undefined) {
            throw new InternalCompilerError('anf s-if-else: branch continuation was not invoked');
          }
          if (first) {
            result = translated;
            firstIf = aif;
          } else {
            prevIf!.e = translated;
          }
          prevIf = aif;
          isFirst = false;
        }
        if (!elseIsIf) {
          break;
        }
        node = _else as typeof e;
      }
      const kRes = k(firstIf!);
      if (result === kPlaceholder) {
        return kRes;
      }
      tailPatcher(result!, kPlaceholder!)(kRes);
      return result!;
    }
    case 's-cases-else': {
      const { l, typ, val, branches, _else } = e;
      return anfName(val, 'cases_val',
        (v) => k(new N.ACases(l, typ, v, branches.map(anfCasesBranch), anfTerm(_else))));
    }
    case 's-block':
      return anfBlock(e.stmts, k);

    case 's-check-expr': {
      const { l, expr, ann } = e;
      const name = mkId(l, 'ann_check_temp');
      const bindings = [new A.SLetBind(l, new A.SBind(l, false, name.id, ann), expr)];
      return anf(new A.SLetExpr(l, bindings, new A.SId(l, name.id), false), k);
    }

    case 's-lam': {
      const { l, name, args, ann: ret, body } = e;
      if (A.isABlank(ret) || A.isAAny(ret)) {
        return k(new N.ALam(l, name, args.map((a) => new N.ABind(a.l, field(a, 'id'), field(a, 'ann'))), ret, anfTerm(body)));
      } else {
        const temp = mkId(l, 'ann_check_temp');
        return k(new N.ALam(l, name, args.map((a) => new N.ABind(a.l, field(a, 'id'), field(a, 'ann'))), ret,
          anfTerm(new A.SLetExpr(l,
            [new A.SLetBind(l, new A.SBind(l, false, temp.id, ret), body)],
            new A.SId(l, temp.id), false))));
      }
    }
    case 's-method': {
      const { l, name, args, ann: ret, body } = e;
      if (A.isABlank(ret) || A.isAAny(ret)) {
        return k(new N.AMethod(l, name, args.map((a) => new N.ABind(a.l, field(a, 'id'), field(a, 'ann'))), ret, anfTerm(body)));
      } else {
        const temp = mkId(l, 'ann_check_temp');
        return k(new N.AMethod(l, name, args.map((a) => new N.ABind(a.l, field(a, 'id'), field(a, 'ann'))), ret,
          anfTerm(new A.SLetExpr(l,
            [new A.SLetBind(l, new A.SBind(l, false, temp.id, ret), body)],
            new A.SId(l, temp.id), false))));
      }
    }
    case 's-tuple': {
      const l = e.l;
      return anfNameRec(e.fields, 'anf_tuple_fields', (vs) =>
        k(new N.ATuple(l, vs)));
    }
    case 's-tuple-get': {
      const { l, tup, index } = e;
      return anfName(tup, 'anf_tuple_get', (v) => k(new N.ATupleGet(l, v, index)));
    }
    case 's-array': {
      const { l, values } = e;
      const arrayId = names.makeAtom('anf_array');
      return new N.ALet(
        l,
        bind(l, arrayId),
        new N.APrimApp(l, 'makeArrayN', [new N.ANum(l, jsnums.fromFixnum(values.length) as PyretNumber)], flatPrimApp),
        anfNameArrRec(values, arrayId, 0, () =>
          k(new N.AVal(l, new N.AId(l, arrayId)))));
    }

    case 's-app-enriched': {
      const { l, _fun: f, args, appInfo } = e;
      switch (f.$name) {
        case 's-dot': {
          const m = f.field;
          return anfName(f.obj, 'anf_method_obj', (v) =>
            anfNameRec(args, 'anf_arg', (vs) =>
              k(new N.AMethodApp(l, v, m, vs))));
        }
        case 's-lam': {
          /// NOTE: This case implements the inline-lams visitor transformation
          /// It can be safely eliminated without affecting the semantics of
          /// the transformation, but does help eliminate some unneeded lambdas
          const params = f.args;
          const ann = f.ann;
          const body = f.body;
          const blocky = f.blocky;
          if (params.length === args.length) {
            const letBinds = map2((p: A.Bind, a: A.Expr): A.LetBind =>
              new A.SLetBind(p.l, p, a), params, args);
            let inlined: A.Expr;
            switch (ann.$name) {
              case 'a-blank':
                inlined = new A.SLetExpr(l, letBinds, body, blocky);
                break;
              case 'a-any':
                inlined = new A.SLetExpr(l, letBinds, body, blocky);
                break;
              default: {
                const a = A.globalNames.makeAtom('inline_body');
                inlined = new A.SLetExpr(l,
                  [...letBinds, new A.SLetBind(body.l, new A.SBind(l, false, a, ann), body)],
                  new A.SId(l, a), false);
                break;
              }
            }
            return anf(inlined, k);
          } else {
            return anfName(f, 'anf_fun', (v) =>
              anfNameRec(args, 'anf_arg', (vs) =>
                k(new N.AApp(l, v, vs, appInfo))));
          }
        }
        default:
          return anfName(f, 'anf_fun', (v) =>
            anfNameRec(args, 'anf_arg', (vs) =>
              k(new N.AApp(l, v, vs, appInfo))));
      }
    }

    case 's-prim-app': {
      const { l, _fun: f, args, appInfo } = e;
      return anfNameRec(args, 'anf_arg', (vs) =>
        k(new N.APrimApp(l, f, vs, appInfo)));
    }

    case 's-instantiate':
      return anf(e.expr, k);

    case 's-dot': {
      const { l, obj, field } = e;
      return anfName(obj, 'anf_bracket', (tObj) => k(new N.ADot(l, tObj, field)));
    }

    case 's-bracket':
      return raise('Impossible');

    case 's-ref':
      return k(new N.ARef(e.l, e.ann));

    case 's-id-var':
      return k(new N.AIdVar(e.l, e.id));

    case 's-id-letrec': {
      const { l, id, safe } = e;
      if (safe) {
        return k(new N.AVal(l, new N.AIdSafeLetrec(l, id)));
      } else {
        return k(new N.AIdLetrec(l, id, safe));
      }
    }

    case 's-get-bang': {
      const { l, obj, field } = e;
      return anfName(obj, 'anf_get_bang', (t) => k(new N.AGetBang(l, t, field)));
    }

    case 's-assign': {
      const { l, id, value } = e;
      return anfName(value, 'anf_assign', (v) => k(new N.AAssign(l, id, v)));
    }

    case 's-obj': {
      const { l, fields } = e;
      const exprs = fields.map(getValue);

      return anfNameRec(exprs, 'anf_obj', (ts) => {
        const newFields = map2((f: A.Member, t: N.AVal): N.AField =>
          new N.AField(f.l, field(f, 'name'), t), fields, ts);
        return k(new N.AObj(l, newFields));
      });
    }

    case 's-update': {
      const { l, supe: obj, fields } = e;
      const exprs = fields.map(getValue);

      return anfName(obj, 'anf_update', (o) =>
        anfNameRec(exprs, 'anf_update', (ts) => {
          const newFields = map2((f: A.Member, t: N.AVal): N.AField =>
            new N.AField(f.l, field(f, 'name'), t), fields, ts);
          return k(new N.AUpdate(l, o, newFields));
        }));
    }

    case 's-extend': {
      const { l, supe: obj, fields } = e;
      const exprs = fields.map(getValue);

      return anfName(obj, 'anf_extend', (o) =>
        anfNameRec(exprs, 'anf_extend', (ts) => {
          const newFields = map2((f: A.Member, t: N.AVal): N.AField =>
            new N.AField(f.l, field(f, 'name'), t), fields, ts);
          return k(new N.AExtend(l, o, newFields));
        }));
    }

    case 's-let':
      return raise('s-let should have been desugared already: ' + torepr(e));
    case 's-var':
      return raise('s-var should have been desugared already: ' + torepr(e));
    case 's-spy-block':
      return raise('s-spy-block should have been desugared already: ' + torepr(e));
    case 's-user-block':
      return raise('s-user-block should have been desugared already: ' + torepr(e));
    default:
      return raise('Missed case in anf: ' + torepr(e));
  }
}
