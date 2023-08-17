import type * as TS from './ts-type-structs';
import type * as A from './ts-ast';
import type * as CS from './ts-compile-structs';
import type * as AU from './ts-ast-util';
import type * as TJ from './ts-codegen-helpers';
import type * as TSH from './ts-compile-structs-helpers';
import type { List, Option, MutableStringDict, PFunction, StringDict, PMethod, Runtime } from './ts-impl-types';
import type * as Immutable from 'immutable';
import type { Map as ImMap } from 'immutable';

export type Exports = {
  dict: {
    values: {
      dict: {
        'desugar-scope': PFunction<(program: A.Program, env: CS.CompileEnvironment, options : any) => CS.ScopeResolution>
        'resolve-names': PFunction<(program: A.Program, thismodulesUri: string, initialEnv: CS.CompileEnvironment) => CS.NameResolution>
      }
    }
  }
}

({
  requires: [
    { 'import-type': 'dependency', protocol: 'js-file', args: ['ts-codegen-helpers']},
    { 'import-type': 'dependency', protocol: 'js-file', args: ['ts-compile-structs-helpers']},
    { 'import-type': 'dependency', protocol: 'file', args: ['type-structs.arr']},
    { 'import-type': 'dependency', protocol: 'file', args: ['ast.arr']},
    { 'import-type': 'dependency', protocol: 'file', args: ['compile-structs.arr']},
    { 'import-type': 'dependency', protocol: 'js-file', args: ['ts-ast-util']},
 ],
  nativeRequires: ["immutable"],
  provides: {
    values: {
      "desugar-scope": "tany",
      "resolve-names": "tany"
    }
  },
  theModule: function(runtime: Runtime, _, __, tj : TJ.Exports, TS : (TS.Exports), TSH : (TSH.Exports), Ain : (A.Exports), CSin : (CS.Exports), AUin : (AU.Exports), immutable : typeof Immutable) {
    const { Map: ImMap } = immutable;
    const A = Ain.dict.values.dict;
    const AU = AUin.dict.values.dict;
    const CS = CSin.dict.values.dict;
    const {
      listToArray,
      InternalCompilerError,
      MakeName
    } = tj;

    const scopeNames = MakeName(0);

    const empty = runtime.ffi.makeList([]);

    // NOTE(joe/ben Aug 2023): This is a global that is referred to and reset on each call to
    // resolve scope.
    let errors : Array<CS.CompileError>;

    function desugarToplevelTypes(stmts : Array<A.Expr>) : Array<A.Expr> {
      const typeBinds : A.TypeLetBind[] = [];
      const ansStmts : A.Expr[] = [];
      stmts.forEach(s => {
        switch(s.$name) {
          case 's-type': {
            ansStmts.push(s);
            break;
          }
          case 's-newtype': {
            typeBinds.push(A['s-newtype-bind'].app(s.dict.l, s.dict.name, s.dict.namet));
            break;
          }
          case 's-data': {
            const { l, name, params, mixins, variants, "shared-members": shared, "_check-loc": checkLoc, _check } = s.dict;
            const namet = scopeNames.makeAtom(name);
            typeBinds.push(A['s-newtype-bind'].app(l, A['s-name'].app(l, name), namet));
            ansStmts.push(A['s-data-expr'].app(l, name, namet, params, mixins, variants, shared, checkLoc, _check));
            break;
          }
          default: {
            ansStmts.push(s);
          }
        }
      });
      if(typeBinds.length === 0) { return stmts; }
      else {
        return [
          A['s-type-let-expr'].app(
              typeBinds[0].dict.l,
              runtime.ffi.makeList(typeBinds),
              A['s-block'].app(typeBinds[0].dict.l, runtime.ffi.makeList(ansStmts)),
              ansStmts.length > 1)
          ];
      }
    }

    type Contract = TJ.Variant<A.Expr, 's-contract'>;

    type BindingGroup =
      | [ 'let-binds', Contract[], A.LetBind[] ]
      | [ 'letrec-binds', Contract[], A.LetrecBind[] ]
      | [ 'type-let-binds', [], A.TypeLetBind[] ]
    
    function weaveContracts(contracts : Contract[], binds : A.LetBind[]) : A.LetBind[];
    function weaveContracts(contracts : Contract[], binds : A.LetrecBind[]) : A.LetrecBind[];
    function weaveContracts(contracts : Contract[], binds : (A.LetBind[] | A.LetrecBind[])) : (A.LetBind | A.LetrecBind)[];
    function weaveContracts(contracts : Contract[], binds : (A.LetBind[] | A.LetrecBind[])) : (A.LetBind | A.LetrecBind)[] {
      const contractsSD : Map<string, Contract> = new Map();
      contracts.forEach(c => {
        const name = tj.nameToName(c.dict.name);
        if(contractsSD.has(name)) {
          errors.unshift(CS['contract-redefined'].app(c.dict.l, name, contractsSD.get(name)!.dict.l))
        }
        else {
          contractsSD.set(name, c);
        }
      });
      function rebuildBind(b : A.LetBind, newB : A.Bind, newV : A.Expr) : A.LetBind;
      function rebuildBind(b : A.LetrecBind, newB : A.Bind, newV : A.Expr) : A.LetrecBind;
      function rebuildBind(b : A.LetBind | A.LetrecBind, newB : A.Bind, newV : A.Expr) : A.LetBind | A.LetrecBind;
      function rebuildBind(b : A.LetBind | A.LetrecBind, newB : A.Bind, newV : A.Expr) : A.LetBind | A.LetrecBind {
        switch(b.$name) {
          case 's-let-bind': { return A['s-let-bind'].app(b.dict.l, newB, newV); }
          case 's-var-bind': { return A['s-var-bind'].app(b.dict.l, newB, newV); }
          case 's-letrec-bind': { return A['s-letrec-bind'].app(b.dict.l, newB, newV); }
        }
      }
      type SBind = TJ.Variant<A.Bind, 's-bind'>;
      function namesMatch(funargs : List<SBind>, annargs : List<SBind>) {
        const funargsArray = listToArray(funargs);
        const annargsArray = listToArray(annargs);
        if(funargsArray.length !== annargsArray.length) { return false; }
        for(let i = 0; i < funargsArray.length; i += 1) {
          if(tj.nameToName(funargsArray[i].dict.id) !== tj.nameToName(annargsArray[i].dict.id)) { return false; }
        }
        return true;
      }
      function paramsMatch(funparams : List<A.Name>, annparams : List<A.Name>) {
        const funparamsArray = listToArray(funparams);
        const annparamsArray = listToArray(annparams);
        if(funparamsArray.length !== annparamsArray.length) { return false; }
        for(let i = 0; i < funparamsArray.length; i += 1) {
          if(tj.nameToName(funparamsArray[i]) !== tj.nameToName(annparamsArray[i])) { return false; }
        }
        return true;
      }
      function funToLam(bind : A.LetBind) : A.LetBind;
      function funToLam(bind : A.LetrecBind) : A.LetrecBind;
      function funToLam(bind : A.LetBind | A.LetrecBind) : A.LetBind | A.LetrecBind;
      function funToLam(bind : A.LetBind | A.LetrecBind) : A.LetBind | A.LetrecBind {
        const { l, b, value } = bind.dict;
        switch(value.$name) {
          case 's-fun': {
            const { name, params, args, ann, doc, body, '_check-loc' : checkLoc, _check : check, blocky } = value.dict;
            const newBody = A['s-lam'].app(l, name, params, args, ann, doc, body, checkLoc, check, blocky);
            return rebuildBind(bind, b, newBody);
          }
          default: {
            return rebuildBind(bind, b, value);
          }
        }
      }
      function isBlankContract(a : A.Ann) : boolean {
        switch(a.$name) {
          case 'a-blank': { return true; }
          case 'a-tuple': { return listToArray(a.dict.fields).every(isBlankContract); }
          default: {
            return false;
          }
        }
      }

      const revAns = binds.map((bind : (A.LetBind | A.LetrecBind)) => {
        switch(bind.dict.b.$name) {
          case 's-bind': {
            const { l, shadows, id, ann } = bind.dict.b.dict;
            const idName = tj.nameToName(id);
            if(!contractsSD.has(idName)) {
              return funToLam(bind); 
            }
            else {
              const c = contractsSD.get(idName)!;
              contractsSD.delete(idName);
              if(ann.$name === 'a-blank') {
                if(!tj.beforeSrcloc(c.dict.l, bind.dict.value.dict.l)) {
                  errors.unshift(CS['contract-bad-loc'].app(c.dict.l, idName, bind.dict.value.dict.l));
                  return funToLam(bind);
                }
                else {
                  switch(bind.dict.value.$name) {
                    case 's-fun': {
                      const { l: lFun, name, params, args, ann, doc, body, '_check-loc' : checkLoc, _check : check, blocky } = bind.dict.value.dict;
                      const bindargs : SBind[] = listToArray(args) as SBind[];
                      if(!(bindargs.every(a => isBlankContract(a.dict.ann)) && (ann.$name === 'a-blank'))) {
                        errors.unshift(CS['contract-redefined'].app(c.dict.l, idName, lFun));
                        return funToLam(bind);
                      }
                      else if(c.dict.ann.$name === 'a-arrow' || c.dict.ann.$name === 'a-arrow-argnames') {
                        let okParams = true;
                        if(params.$name === 'link' && !(paramsMatch(c.dict.params, params))) { 
                          errors.unshift(CS['contract-inconsistent-params'].app(c.dict.l, idName, lFun));
                          okParams = false;
                        }
                        let okArgs = true;
                        if(c.dict.ann.$name === 'a-arrow-argnames') {
                          if(!(namesMatch(args as List<SBind>, c.dict.ann.dict.args as List<SBind>))) {
                            errors.unshift(CS['contract-inconsistent-names'].app(c.dict.l, idName, lFun));
                            okArgs = false;
                          }
                        }
                        else {
                          if(listToArray(args).length !== listToArray(c.dict.ann.dict.args).length) {
                            errors.unshift(CS['contract-inconsistent-names'].app(c.dict.l, idName, lFun));
                            okArgs = false;
                          }
                        }

                        if(okParams && okArgs) {
                          const argAnns = c.dict.ann.$name === 'a-arrow-argnames'
                            ? listToArray(c.dict.ann.dict.args).map(a => a.dict.ann)
                            : listToArray(c.dict.ann.dict.args);
                          const newargs = argAnns.map((ann : A.Ann, i : number) => {
                            const a = bindargs[i];
                            return A['s-bind'].app(a.dict.l, a.dict.shadows, a.dict.id, ann);
                          });
                          const newLam = A['s-lam'].app(lFun, name, c.dict.params, runtime.ffi.makeList(newargs), c.dict.ann.dict.ret, doc, body, checkLoc, check, blocky);
                          return rebuildBind(bind, bind.dict.b, newLam);
                        }
                        else {
                          return funToLam(bind);
                        }

                      }
                      else {
                        errors.unshift(CS['contract-non-function'].app(c.dict.l, idName, lFun, true));
                        return funToLam(bind);
                      }
                      break; // Check to make sure this stays dead code
                    }
                    default : {
                      if(c.dict.ann.$name === 'a-arrow' || c.dict.ann.$name === 'a-arrow-argnames') {
                        errors.unshift(CS['contract-non-function'].app(c.dict.l, idName, bind.dict.value.dict.l, false));
                        return bind;
                      }
                      else {
                        return rebuildBind(bind, A['s-bind'].app(l, shadows, id, c.dict.ann), bind.dict.value);
                      }
                    }
                  }
                }
              }
              else {
                errors.unshift(CS['contract-redefined'].app(c.dict.l, idName, bind.dict.value.dict.l));
                return funToLam(bind);
              }
            }
          }
          default: {
            return bind;
          }
        }
      });
      contractsSD.forEach((c : Contract, name : string) => {
        errors.unshift(CS['contract-unused'].app(c.dict.l, name));
      });
      return revAns.reverse(); // NOTE(Joe/Ben): we think
    }
    
    type DesugarVisitor =
        TJ.Visitor<A.Expr, A.Expr>
      & TJ.Visitor<A.CasesBranch, A.CasesBranch>
      & TJ.Visitor<A.Member, A.Member>
      & TJ.Visitor<A.Bind, A.Bind>
      & TJ.Visitor<A.CasesBind, A.CasesBind>
      & TJ.Visitor<A.Name, A.Name>
      & TJ.Visitor<Option<A.Expr>, Option<A.Expr>>
      & TJ.Visitor<A.Ann, A.Ann>;

    /**
        Treating stmts as a block, resolve scope.
        There should be no blocks left after this stage of the compiler pipeline.
      */
    function desugarScopeBlock(stmts: A.Expr[], bindingGroup : BindingGroup) : A.Expr {
      if(stmts.length === 0) {
        throw new InternalCompilerError("Should not get an empty block in desugarScopeBlock");
      }
      else {
        const [f, ...rest] = stmts;
        switch(f.$name) {
          case 's-type': {
            return addTypeLetBind(bindingGroup, A['s-type-bind'].app(f.dict.l, f.dict.name, f.dict.params, f.dict.ann), rest);
          }
          case 's-contract': {
            const index = rest.findIndex((e : A.Expr) => e.$name !== 's-contract');
            const [ contracts, restStmts ] = index === -1 ? [ [], rest ] : [ rest.slice(0, index), rest.slice(index) ];
            return addContracts(bindingGroup, [ f, ...(contracts as Contract[]) ], restStmts);
          }
          case 's-let': {
            return addLetBind(bindingGroup, A['s-let-bind'].app(f.dict.l, f.dict.name, f.dict.value), rest);
          }
          case 's-var': {
            return addLetBind(bindingGroup, A['s-var-bind'].app(f.dict.l, f.dict.name, f.dict.value), rest);
          }
          case 's-rec': {
            return addLetrecBind(bindingGroup, A['s-letrec-bind'].app(f.dict.l, f.dict.name, f.dict.value), rest);
          }
          case 's-fun': {
            const { l, name, '_check-loc' : checkLoc, _check : check } = f.dict;
            if(check.$name === 'some') {
              rest.unshift(whereAsCheck(l, name, checkLoc, check.dict.value))
            }
            // NOTE(Ben 2017): deliberately keeping this as an s-fun by using f directly below,
            // it'll get turned into an s-lam in weave-contracts
            const lrb = A['s-letrec-bind'].app(l, A['s-bind'].app(l, false, A['s-name'].app(l, name), A['a-blank']), f)
            return addLetrecBind(bindingGroup, lrb, rest);
          }
          case 's-data-expr': {
            const { l, name, variants } = f.dict;
            function b(l : A.Srcloc, id : string) { return A['s-bind'].app(l, false, A['s-name'].app(l, id), A['a-blank']); }
            function bn(l : A.Srcloc, n : A.Name) { return A['s-bind'].app(l, false, n, A['a-blank']); }
            function variantBinds(dataBlobId : A.Expr, variant : A.Variant) : A.LetrecBind[] {
              const { l, name } = variant.dict;
              const checkerName = makeCheckerName(name);
              const getPart = (n) => A['s-dot'].app(l, dataBlobId, n);
              return [
                A['s-letrec-bind'].app(l, b(l, name), getPart(name)),
                A['s-letrec-bind'].app(l, b(l, checkerName), getPart(checkerName)),
              ]
            }
            const blobId = scopeNames.makeAtom("data-blob");
            const bindData = A['s-letrec-bind'].app(l, bn(l, blobId), f);
            const lookupChecker = A['s-dot'].app(l, A['s-id-letrec'].app(l, blobId, true), makeCheckerName(name));
            const bindDataPred = A['s-letrec-bind'].app(l, b(l, makeCheckerName(name)), lookupChecker);
            const allBinds = listToArray(variants).flatMap((v : A.Variant) => variantBinds(A['s-id-letrec'].app(l, blobId, true), v));
            const allBinds2 = [...allBinds, bindDataPred, bindData];
            return addLetrecBinds(bindingGroup, allBinds2, rest);
          }
          case 's-check': {
            const { l } = f.dict;
            function b(l : A.Srcloc) { return A['s-bind'].app(l, false, A['s-underscore'].app(l), A['a-blank']); }
            return addLetrecBind(bindingGroup, A['s-letrec-bind'].app(l, b(l), f), rest);
          }
          default: {
            if(rest.length === 0) {
              return bindWrap(bindingGroup, f);
            }
            else {
              const restStmt = desugarScopeBlock(rest, [ 'let-binds', [], [] ]);
              let restStmts;
              switch(restStmt.$name) {
                case 's-block': {
                  const { l, stmts } = restStmt.dict;
                  restStmts = [f, ...listToArray(stmts) ];
                  break;
                }
                default: {
                  restStmts = [f, restStmt];
                  break;
                }
              }
              return bindWrap(bindingGroup, A['s-block'].app(f.dict.l, runtime.ffi.makeList(restStmts)));
            }
          }
        }
      }
    }

    function makeCheckerName(s : string) { return "is-" + s; }

    function bindWrap(bindingGroup : BindingGroup, e : A.Expr) : A.Expr {
      const [kind, contracts, revBinds] = bindingGroup;
      if(revBinds.length === 0) { 
        contracts.forEach((c : Contract) => errors.unshift(CS['contract-unused'].app(c.dict.l, tj.nameToName(c.dict.name))));
        return e;
      }
      else {
        switch(kind) {
          case 'let-binds': {
            const withContracts = weaveContracts(contracts, revBinds);
            return A['s-let-expr'].app(revBinds[0].dict.l, runtime.ffi.makeList(withContracts), e, false);
          }
          case 'letrec-binds': {
            const withContracts = weaveContracts(contracts, revBinds);
            return A['s-letrec'].app(revBinds[0].dict.l, runtime.ffi.makeList(withContracts), e, false);
          }
          case 'type-let-binds': {
            return A['s-type-let-expr'].app(revBinds[0].dict.l, runtime.ffi.makeList(revBinds.reverse()), e, false);
          }
        }
      }
    }

    function whereAsCheck(l : A.Srcloc, name : string, checkLoc : Option<A.Srcloc>, check : A.Expr) : A.Expr {
      if(checkLoc.$name === 'some') { l = checkLoc.dict.value; }
      return A['s-check'].app(l, runtime.ffi.makeSome(name), check, false);
    }

    function addTypeLetBind(bindingGroup : BindingGroup, bind : A.TypeLetBind, rest : A.Expr[]) : A.Expr {
      const [kind, contracts, revBinds] = bindingGroup;
      switch(kind) {
        case 'type-let-binds': {
          return desugarScopeBlock(rest, [ kind, contracts, [ bind, ...revBinds ] ]);
        }
        default: {
          return bindWrap(bindingGroup, desugarScopeBlock(rest, [ 'type-let-binds', [], [ bind ] ]));
        }
      }
    }

    function addLetBind(bindingGroup : BindingGroup, bind : A.LetBind, rest : A.Expr[]) : A.Expr {
      const [kind, contracts, revBinds] = bindingGroup;
      let lb;
      switch(bind.$name) {
        case 's-let-bind': {
          lb = simplifyLetBind(bind.dict.l, bind.dict.b, bind.dict.value, []);
          break;
        }
        case 's-var-bind': {
          lb = [ bind ];
          break;
        }
      }
      switch(kind) {
        case 'let-binds': {
          return desugarScopeBlock(rest, [ kind, contracts, [...lb, ...revBinds ] ]);
        }
        default: {
          return bindWrap(bindingGroup, desugarScopeBlock(rest, [ 'let-binds', [], lb ]));
        }
      }
    }

    function addLetrecBind(bindingGroup : BindingGroup, bind : A.LetrecBind, rest : A.Expr[]) : A.Expr {
      return addLetrecBinds(bindingGroup, [ bind ], rest);
    }

    function addLetrecBinds(bindingGroup : BindingGroup, binds : A.LetrecBind[], rest : A.Expr[]) : A.Expr {
      const [kind, contracts, revBinds] = bindingGroup;
      switch(kind) {
        case 'letrec-binds': {
          return desugarScopeBlock(rest, [ kind, contracts, [...binds, ...revBinds ] ]);
        }
        default: {
          return bindWrap(bindingGroup, desugarScopeBlock(rest, [ 'letrec-binds', [], binds ]));
        }
      }
    }

    function addContracts(bindingGroup : BindingGroup, contracts : Contract[], stmts : A.Expr[]) : A.Expr {
      if(stmts.length === 0) {
        throw new InternalCompilerError("Impossible: well-formedness prohibits contracts being last in block (at " + tj.formatSrcloc(contracts[0].dict.l, true) + ")");
      }
      const [kind, contracts2, revBinds] = bindingGroup;
      const [first, ...rest] = stmts;
      if(['s-rec', 's-fun', 's-data-expr', 's-check'].includes(first.$name)) {
        if(kind === 'letrec-binds') {
          return desugarScopeBlock(stmts, [ 'letrec-binds', [...contracts, ...contracts2], revBinds ]);
        }
        else {
          return bindWrap(bindingGroup, desugarScopeBlock(stmts, [ 'letrec-binds', contracts, [] ]));
        }
      }
      else {
        if(kind == 'let-binds') {
          return desugarScopeBlock(stmts, [ 'let-binds', [...contracts, ...contracts2], revBinds ]);
        }
        else {
          return bindWrap(bindingGroup, desugarScopeBlock(stmts, [ 'let-binds', contracts, [] ]));
        }
      }
    }

    function simplifyLetBind(l : A.Srcloc, bind : A.Bind, expr : A.Expr, binds : A.LetBind[]) : A.LetBind[] {
      switch(bind.$name) {
        case 's-bind': {
          binds.unshift(A['s-let-bind'].app(l, bind, expr));
          break;
        }
        case 's-tuple-bind': {
          const { l : lb, fields, 'as-name': asName } = bind.dict;
          let boundExpr : A.Expr;
          let binding : A.LetBind;
          switch(asName.$name) {
            case 'none': {
              const name = scopeNames.makeAtom("tup");
              const newFields = listToArray(fields).map((f : A.Bind) => {
                switch(f.$name) {
                  case 's-bind': { return f.dict.ann; }
                  case 's-tuple-bind': { return A['a-blank']; }
                }
              });
              const ann = A['a-tuple'].app(lb, runtime.ffi.makeList(newFields));
              boundExpr = A['s-id'].app(lb, name);
              binding = A['s-let-bind'].app(lb, A['s-bind'].app(lb, false, name, ann), expr);
              break;
            }
            case 'some': {
              const b = (asName.dict.value as TJ.Variant<A.Bind, 's-bind'>);
              let someBinding;
              switch(b.dict.ann.$name) {
                case 'a-blank': {
                  const ann = A['a-tuple'].app(lb, runtime.ffi.makeList(listToArray(fields).map(f => A['a-blank'])));
                  someBinding = A['s-bind'].app(b.dict.l, b.dict.shadows, b.dict.id, ann);
                  break;
                }
                default: {
                  someBinding = b;
                }
              }
              boundExpr = A['s-id'].app(b.dict.l, b.dict.id);
              binding = A['s-let-bind'].app(l, someBinding, expr);
              break;
            }
          }
          binds.unshift(binding);
          listToArray(fields).forEach((f, i : number) => {
            simplifyLetBind(f.dict.l, f, A['s-tuple-get'].app(f.dict.l, boundExpr, i, f.dict.l), binds);
          });
        }
      }
      return binds;
    }

    const desugarScopeVisitor : DesugarVisitor = {
      's-block': function(self, e) {
        const { l, stmts } = e.dict;
        const newStmts = listToArray(stmts).map((s : A.Expr) => tj.map(self, s));
        return desugarScopeBlock(newStmts, [ 'let-binds', [], [] ]);
      },
      's-let-expr': function(self, e) {
        const { l, binds, body, blocky } = e.dict;
        const vBody = tj.map(self, body);
        const bindsArray = listToArray(binds);
        const newBinds = [];
        bindsArray.forEach((b : A.LetBind) => {
          simplifyLetBind(b.dict.l, b.dict.b, b.dict.value, newBinds);
        });
        return A['s-let-expr'].app(l, runtime.ffi.makeList(newBinds), vBody, blocky);
      },
      's-for': function(self : DesugarVisitor, e) {
        const { l, iterator, bindings, ann, body, blocky } = e.dict;
        const vIterator = tj.map(self, iterator);
        const vAnn = tj.map(self, ann);
        const vBody = tj.map(self, body);
        let newBinds : A.ForBind[] = [];
        let newBody = vBody;
        const binds = listToArray(bindings);
        binds.forEach((b : A.ForBind) => {
          const vBind = tj.map(self, b.dict.bind);
          const vValue = tj.map(self, b.dict.value);
          const lbs = simplifyLetBind(b.dict.l, vBind, vValue, []);
          const argBind = lbs[0];
          newBinds.push(A['s-for-bind'].app(b.dict.l, argBind.dict.b, argBind.dict.value));
          if(lbs.length > 1) {
            newBody = A['s-let-expr'].app(b.dict.l, runtime.ffi.makeList(lbs.slice(1)), newBody, false);
          }
        });
        return A['s-for'].app(l, vIterator, runtime.ffi.makeList(newBinds), vAnn, newBody, blocky);
      },
      's-cases-branch': function(self : DesugarVisitor, e) {
        const { l, 'pat-loc': patLoc, name, args, body } = e.dict;
        const vBody = tj.map(self, body);
        let newBinds : A.CasesBind[] = [];
        let newBody = vBody;
        const argsArray = listToArray(args);
        argsArray.forEach((a : A.CasesBind) => {
          const lbs = simplifyLetBind(a.dict.l, tj.map(self, a.dict.bind), A['s-str'].app(a.dict.l, "placeholder-cases"), []);
          const argBind = lbs[0];
          newBinds.push(A['s-cases-bind'].app(a.dict.l, a.dict['field-type'], argBind.dict.b));
          if(lbs.length > 1) {
            newBody = A['s-let-expr'].app(a.dict.l, runtime.ffi.makeList(lbs.slice(1)), newBody, false);
          }
        });
        return A['s-cases-branch'].app(l, patLoc, name, runtime.ffi.makeList(newBinds), newBody);
      },
      's-fun': function(self, e) {
        const { l, name, params, args, ann, doc, body, '_check-loc' : checkLoc, _check : check, blocky } = e.dict;
        return rebuildFun(A['s-fun'], self, l, name, params, args, ann, doc, body, checkLoc, check, blocky);
      },
      's-lam': function(self, e) {
        const { l, name, params, args, ann, doc, body, '_check-loc' : checkLoc, _check : check, blocky } = e.dict;
        return rebuildFun(A['s-lam'], self, l, name, params, args, ann, doc, body, checkLoc, check, blocky);
      },
      's-method-field': function(self, e) {
        const { l, name, params, args, ann, doc, body, '_check-loc' : checkLoc, _check : check, blocky } = e.dict;
        return rebuildFun(A['s-method-field'], self, l, name, params, args, ann, doc, body, checkLoc, check, blocky);
      }
    };


    type FunctionBuilder = typeof A['s-lam' | 's-method-field' | 's-fun'];
    function rebuildFun(rebuild : FunctionBuilder, visitor : DesugarVisitor, l : A.Srcloc, name : string, params : List<A.Name>, args : List<A.Bind>, ann : A.Ann, doc : string, body : A.Expr, checkLoc : Option<A.Srcloc>, check : Option<A.Expr>, blocky : boolean) : any {
      const vParams = listToArray(params).map((p : A.Name) => tj.map(visitor, p));
      const vAnn = tj.map(visitor, ann);
      const vBody = tj.map(visitor, body);
      const vCheck = tj.map(visitor, check);
      const placeholder = A['s-str'].app(l, "placeholder-rebuild");
      let newBinds : A.Bind[] = [];
      let newBody = vBody;
      const argsArray = listToArray(args);
      argsArray.forEach((a : A.Bind) => {
        const lbs = simplifyLetBind(a.dict.l, tj.map(visitor, a), placeholder, []).reverse();
        const argBind = lbs[0];
        newBinds.push(argBind.dict.b);
        if(lbs.length > 1) {
          newBody = A['s-let-expr'].app(a.dict.l, runtime.ffi.makeList(lbs.slice(1)), newBody, false);
        }
      });
      return rebuild.app(l, name, runtime.ffi.makeList(vParams), runtime.ffi.makeList(newBinds), vAnn, doc, newBody, checkLoc, vCheck, blocky);
    }

    /**
       Remove x = e, var x = e, tuple bindings, and fun f(): e end
       and turn them into explicit let and letrec expressions.
       Do this recursively through the whole program.
       Preconditions on prog:
         - well-formed
       Postconditions on prog:
         - contains no s-provide in headers
         - contains no s-let, s-var, s-data, s-tuple-bind
     */
    function desugarScope(program: A.Program, env: CS.CompileEnvironment): CS.ScopeResolution {
      switch(program.$name) {
        case 's-program': {
          const { l, '_use' : _useRaw, '_provide' : _provideRaw, 'provided-types' : provideTypesRaw, provides, imports: importsRaw, block : body} = program.dict;
          const str = function(s : string) { return A['s-str'].app(l, s); }

          let withImports : A.Expr;
          switch(body.$name) {
            case 's-block': {
              const asArray = runtime.ffi.makeList(desugarToplevelTypes(listToArray(body.dict.stmts)))
              withImports = A['s-block'].app(l, asArray);
              break;
            }
            default: {
              const asArray = runtime.ffi.makeList(desugarToplevelTypes([body]))
              withImports = A['s-block'].app(l, asArray);
            }
          }

          function transformToplevelLast(l2 : A.Srcloc, last : A.Expr) : A.Expr {
            const checkers = A['s-dot'].app(l2, AU.checkers.app(l2), "results");
            return A['s-module'].app(l2, last, empty, empty, empty, A['s-app'].app(l2, checkers, empty));
          }

          let withProvides : TJ.Variant<A.Expr, 's-block'>;
          switch(withImports.$name) {
            case 's-block': {
              const { l : l2, stmts } = withImports.dict;
              const stmtsArray = listToArray(stmts);
              const stmtsFront = stmtsArray.slice(0, stmtsArray.length - 1);
              const last = stmtsArray[stmtsArray.length - 1];
              switch(last.$name) {
                case 's-type-let-expr': {
                  const { l : l3, binds, body : body2, blocky } = last.dict;
                  const innerLastArray = listToArray((body2 as TJ.Variant<A.Expr, 's-block'>).dict.stmts);
                  const innerFront = innerLastArray.slice(0, innerLastArray.length - 1);
                  const innerLast = innerLastArray[innerLastArray.length - 1];
                  const innerTransformed = [...innerFront, transformToplevelLast(l3, innerLast)];
                  const newTypeLet = A['s-type-let-expr'].app(l3, binds,
                    A['s-block'].app(body2.dict.l, runtime.ffi.makeList(innerTransformed)), true);
                  const newBlock = A['s-block'].app(l2, runtime.ffi.makeList([...stmtsFront, newTypeLet]))
                  withProvides = newBlock;
                  break;
                }
                default: {
                  withProvides = A['s-block'].app(l2, runtime.ffi.makeList([...stmtsFront, transformToplevelLast(l2, last)]))
                  break;
                }
              }
              break;
            }
            default: {
              throw new InternalCompilerError("Impossible");
            }

          }
          errors = [];

          // NOTE(joe/ben Aug 2023): This next line seems unnecessary, but copying from
          // original Pyret code faithfully (it's just recreating the same block)
          const recombined = A['s-block'].app(withProvides.dict.l, withProvides.dict.stmts);
          const visited = tj.map(desugarScopeVisitor, recombined);
          return CS['resolved-scope'].app(
            A['s-program'].app(
              l, _useRaw, _provideRaw, provideTypesRaw, provides, importsRaw, visited
            ),
            runtime.ffi.makeList(errors)
          );
        }
      }
    }



    /*************
     * The second of the two major entrypoints, resolve-names is responsible for
     * replacing each bare name as written by a user with a uniquely-identified
     * binding.
     * Turn all s-names into s-atom or s-global
     * Requires:
     *  1. desugar-scope
     * Preconditions on p:
     *  -  Contains no s-block, s-let, s-var, s-data, s-rec
     * Postconditions on p (in addition to preconditions):
     *  -  Contains no s-name in names
     * 
     */
    function resolveNames(p: A.Program, thismoduleURI: string, initialEnv: CS.CompileEnvironment): CS.NameResolution {
      const nameErrors : CS.CompileError[] = [];

      // Pyret has 3 namespaces: modules, values, and types. For each, we track
      // bindings and environments

      // Bindings – a global "database" of all binding positions in the program,
      // keyed by unique IDs after resolving them

      // Environments (Envs) - immutable environments used to track bindings
      // from raw names from the program to their unique IDs; these track with
      // scopes


      type BindWithOrigin = CS.ModuleBind | CS.ValueBind | CS.TypeBind;
      type Env<B> = ImMap<string, B>;
      type Bindings<B> = Map<string, B>;

      const moduleBindings : Bindings<CS.ModuleBind> = new Map();
      const bindings : Bindings<CS.ValueBind> = new Map();
      const typeBindings : Bindings<CS.TypeBind> = new Map();

      type DataExpr = TJ.Variant<A.Expr, 's-data-expr'>
      const datatypes : Map<string, DataExpr> = new Map();

      function getOriginLoc(o : CS.BindOrigin) : A.Srcloc {
        return o.dict['definition-bind-site'];
      }
      function getLocalLoc(o : CS.BindOrigin) : A.Srcloc {
        return o.dict['local-bind-site'];
      }

      function makeAnonImportFor<B>(l : A.Srcloc, s : string, env : Env<B>, bindings: Bindings<B>, b : (n : A.Name) => B) : [ A.Name, Env<B> ] {
        const atom = scopeNames.makeAtom(s);
        bindings.set(tj.nameToKey(atom), b(atom));
        return [ atom, env ];
      }

      function makeAtomFor<B extends BindWithOrigin>(name : A.Name, isShadowing : boolean, env : Env<B>, bindings : Bindings<B>,  makeBinding : (a : A.Name) => B) : [ A.Name, Env<B> ] {
        switch(name.$name) {
          case 's-name': {
            const { l, s } = name.dict;
            if(env.has(s) && !isShadowing) {
              const oldLoc = getOriginLoc(env.get(s).dict.origin);
              const localLoc = getLocalLoc(env.get(s).dict.origin);
              const importLocOpt = tj.equalSrcloc(localLoc, p.dict.l) || tj.equalSrcloc(localLoc, tj.dummyLoc)
                ? runtime.ffi.makeNone<A.Srcloc>()
                : runtime.ffi.makeSome(localLoc);
              nameErrors.unshift(CS['shadow-id'].app(s, l, oldLoc, importLocOpt))
            }
            const atom = scopeNames.makeAtom(s)
            const binding = makeBinding(atom);
            bindings.set(tj.nameToKey(atom), binding);
            return [ atom, env.set(s, binding) ];
          }
          case 's-underscore': {
            const atom = scopeNames.makeAtom("$underscore");
            bindings.set(tj.nameToKey(atom), makeBinding(atom));
            return [ atom, env ];
          }
          case 's-atom': {
            const binding = makeBinding(name)
            bindings.set(tj.nameToKey(name), binding);
            return [ name, env ];
          }
          default: {
            throw new InternalCompilerError("Unexpected atom type: " + tj.nameToKey(name));
          }
        }
      }

      function makeImportAtomFor<B extends BindWithOrigin>(name : A.Name, fromUri : string, env : Env<B>, bindings : Bindings<B>, makeBinding : (a : A.Name) => B) : [ A.Name, Env<B> ] {
        switch(name.$name) {
          case 's-name': {
            if(!env.has(tj.nameToName(name))) {
              return makeAtomFor(name, false, env, bindings, makeBinding);
            }
            else {
              const b = env.get(tj.nameToName(name));
              // If they are from the same URI, can import the same name multiple
              // times. If not, then they count as shadowing one another (e.g. two
              // values named list coming from two different libs)
              const shadowing = b.dict.origin.dict['uri-of-definition'] == fromUri;
              return makeAtomFor(name, shadowing, env, bindings, makeBinding);
            }
          }
          default: {
            return makeAtomFor(name, false, env, bindings, makeBinding);
          }
        }
      }

      function scopeEnvFromEnv(initial : CS.CompileEnvironment) : Env<CS.ValueBind> {
        const acc = new Map<string, CS.ValueBind>();
        tj.mapFromStringDict(initial.dict.globals.dict.values).forEach((origin : CS.BindOrigin, name : string) => {
          const uriOfDefinition = origin.dict['uri-of-definition'];
          const valInfo = TSH.valueByOrigin(initial, origin);
          switch(valInfo.$name) {
            case 'none': { throw new InternalCompilerError(`The value is a global that doesn't exist in any module: ${name} which was expected to be in ${uriOfDefinition}`); }
            case 'some': {
              const { value } = valInfo.dict;
              const bindOrigin = TSH.boGlobal(runtime.ffi.makeSome(origin), uriOfDefinition, origin.dict['original-name'])
              const gName = scopeNames.sGlobal(name);
              const binder = value.$name === 'v-var' ? CS['vb-var'] : CS['vb-let'];
              // TODO(joe): Good place to add _location_ to valueexport to report errs better
              const b = CS['value-bind'].app(bindOrigin, binder, gName, A['a-blank']);
              bindings.set(tj.nameToKey(gName), b);
              acc.set(name, b);
            }
          }
        });
        return ImMap(acc);
      }
      function typeEnvFromEnv(initial : CS.CompileEnvironment) : Env<CS.TypeBind> {
        const acc = new Map<string, CS.TypeBind>();
        tj.mapFromStringDict(initial.dict.globals.dict.types).forEach((origin : CS.BindOrigin, name : string) => {
          const typeInfo = TSH.typeByOriginValue(initial, origin);
          const bindOrigin = TSH.boGlobal(runtime.ffi.makeSome(origin), origin.dict['uri-of-definition'], origin.dict['original-name'])
          const gName = scopeNames.sGlobal(name);
          const b = CS['type-bind'].app(bindOrigin, CS['tb-type-let'], gName, CS['tb-typ'].app(typeInfo));
          typeBindings.set(tj.nameToKey(gName), b);
          acc.set(name, b);
        });
        return ImMap(acc);
      }
      function moduleEnvFromEnv(initial : CS.CompileEnvironment) : Env<CS.ModuleBind> {
        const acc = new Map<string, CS.ModuleBind>();
        tj.mapFromStringDict(initial.dict.globals.dict.modules).forEach((origin : CS.BindOrigin, name : string) => {
          const modInfo = TSH.providesByOriginValue(initial, origin);
          const bindOrigin = TSH.boGlobal(runtime.ffi.makeSome(origin), origin.dict['uri-of-definition'], origin.dict['original-name'])
          const modules = tj.mapFromStringDict(modInfo.dict.modules);
          const gName = scopeNames.sModuleGlobal(name);
          const b = CS['module-bind'].app(bindOrigin, gName, modules.get(name)!);
          moduleBindings.set(tj.nameToKey(gName), b);
          acc.set(name, b);
        });
        return ImMap(acc);
      }

      function resolveImportNames(visitor : ResolveNamesVisitor, imports : List<A.Import>, envs : ResolveNamesEnv) : ResolveNamesEnv {
        throw new InternalCompilerError("resolveImportNames not implemented");
      }

      let innermostEnvs : ResolveNamesEnv;

      type ResolveNamesEnv = { env: Env<CS.ValueBind>, typeEnv: Env<CS.TypeBind>, moduleEnv: Env<CS.ModuleBind> };
      type ResolveNamesVisitor =
          TJ.Visitor<A.Expr, A.Expr, ResolveNamesEnv>
        & TJ.Visitor<A.Program, A.Program, ResolveNamesEnv>;

      const namesVisitor : ResolveNamesVisitor = {
        's-module': function(self : ResolveNamesVisitor, e, envs) {
          const { l, answer, checks } = e.dict;
          const nonGlobals = envs!.env.filter((b, k) => {
            return b!.dict.origin.dict['new-definition'];
          });
          const definedVals = nonGlobals.map((vb, key) => {
            const loc = vb!.dict.origin.dict['local-bind-site'];
            const atom = vb!.dict.atom;
            switch(vb!.dict.binder.$name) {
              case 'vb-var': { return A['s-defined-var'].app(key!, atom, loc); }
              case 'vb-let': { return A['s-defined-value'].app(key!, A['s-id'].app(loc, atom)); }
              case 'vb-letrec': { return A['s-defined-value'].app(key!, A['s-id-letrec'].app(loc, atom, true)); }
            }
          }).valueSeq().toArray();

          const nonGlobalTypes = envs!.typeEnv.filter((b, k) => {
            return b!.dict.origin.dict['new-definition'];
          });
          const definedTypes = nonGlobalTypes.map((b, key) => {
            const atom = b!.dict.atom;
            return A['s-defined-type'].app(key!, A['a-name'].app(l, atom));
          }).valueSeq().toArray();

          const nonGlobalModules = envs!.moduleEnv.filter((b, k) => {
            return b!.dict.origin.dict['new-definition'];
          });
          const definedModules = nonGlobalModules.map((b, key) => {
            return A['s-defined-module'].app(key!, b!.dict.atom, b!.dict.uri);
          }).valueSeq().toArray();

          innermostEnvs = envs!;
          return A['s-module'].app(l, tj.map(self, answer, envs), runtime.ffi.makeList(definedModules), runtime.ffi.makeList(definedVals), runtime.ffi.makeList(definedTypes), tj.map(self, checks, envs));
        },

        's-program': function(self : ResolveNamesVisitor, e, envs) {
          const { l, '_use' : _useRaw, _provide, 'provided-types' : provideTypesRaw, provides, imports, block : body} = e.dict;
          const impEnv = resolveImportNames(self, imports, envs!);
          const visitBody = tj.map(self, body, impEnv);

          let provideValsSpecs;
          switch(_provide.$name) {
            case 's-provide': {
              let { l, block } = _provide.dict;
              const object = block as TJ.Variant<A.Expr, 's-obj'>;
              const { fields } = object.dict;
              const specs = listToArray(fields).map((f : A.Member) => {
                if(!('value' in f.dict && f.dict.value.$name === 's-id')) { throw new InternalCompilerError(`The rhs of an object provide was not an id: ${f.dict.name}`); }
                const modref = A['s-module-ref'].app(f.dict.l, runtime.ffi.makeList([f.dict.value.dict.id]), runtime.ffi.makeSome(A['s-name'].app(f.dict.l, f.dict.name)));
                return A['s-provide-name'].app(f.dict.l, modref);
              });
              const withData = [...specs, A['s-provide-data'].app(l, A['s-star'].app(l, empty), empty)];
              provideValsSpecs = A['s-provide-block'].app(l, empty, runtime.ffi.makeList(withData));
              break;
            }
            case 's-provide-all': {
              const { l } = _provide.dict;
              const nameStar = A['s-provide-name'].app(l, A['s-star'].app(l, empty));
              const dataStar = A['s-provide-data'].app(l, A['s-star'].app(l, empty), empty);
              provideValsSpecs = A['s-provide-block'].app(l, empty, runtime.ffi.makeList([nameStar, dataStar]));
              break;
            }
            case 's-provide-none': {
              provideValsSpecs = A['s-provide-block'].app(_provide.dict.l, empty, empty);
              break;
            }
          }

          let provideTypesSpecs;
          switch(provideTypesRaw.$name) {
            case 's-provide-types': {
              const { l, ann } = provideTypesRaw.dict;
              const providedTypes = listToArray(ann).map((a : A.AField) => {
                if(a.dict.ann.$name !== 'a-name') { throw new InternalCompilerError(`Cannot use a non-name as a provided type`); }
                const modref = A['s-module-ref'].app(a.dict.ann.dict.l, runtime.ffi.makeList([a.dict.ann.dict.id]), runtime.ffi.makeSome(A['s-name'].app(a.dict.l, a.dict.name)));
                return A['s-provide-type'].app(l, modref);
              });
              const withData = [...providedTypes, A['s-provide-data'].app(l, A['s-star'].app(l, empty), empty)];
              provideTypesSpecs = A['s-provide-block'].app(l, empty, runtime.ffi.makeList(withData));
              break;
            }
            case 's-provide-types-none': {
              provideTypesSpecs = A['s-provide-block'].app(provideTypesRaw.dict.l, empty, empty);
              break;
            }
            case 's-provide-types-all': {
              const { l } = provideTypesRaw.dict;
              const dataStar = A['s-provide-data'].app(l, A['s-star'].app(l, empty), empty);
              const typeStar = A['s-provide-type'].app(l, A['s-star'].app(l, empty));
              provideTypesSpecs = A['s-provide-block'].app(l, empty, runtime.ffi.makeList([dataStar, typeStar]));
              break;
            }
          }

          const allProvides = [provideValsSpecs, provideTypesSpecs, ...listToArray(provides)];

          throw new InternalCompilerError("s-program case in progress!");

// Pick up after definition of all-provides

        }
      };

      throw new InternalCompilerError("resolveNames in progress!");
    }


    const exports: Exports['dict']['values']['dict'] = {
      'desugar-scope': runtime.makeFunction(desugarScope),
      'resolve-names': runtime.makeFunction(resolveNames)
    };
    return runtime.makeModuleReturn(exports, {});
  }
})