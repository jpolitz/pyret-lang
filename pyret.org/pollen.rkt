#lang racket/base

(module setup racket
  (provide (all-defined-out))
  ; The (not (string-suffix)) makes sure that we don't omit the entire
  ; directory. But then omit everything that's a subdir that is NOT the thing we
  ; want
  (define (keep-subdir ps base subdir)
      (and
          (not (string-suffix? ps base))
          (string-contains? ps base)
          (not (string-contains? ps subdir))))
  ; Everything from the FIRST node_modules component onward. Anchoring to the
  ; first one is the point: embed has a node_modules of its own, and a plain
  ; suffix test would keep that directory too.
  (define (node-modules-tail ps)
    (define m (regexp-match-positions #rx"node_modules" ps))
    (and m (substring ps (cdar m))))
  ; Under node_modules the published site needs exactly one thing:
  ; pyret-embed/dist -- index.html.pm imports dist/pyret.js and points makeEmbed
  ; at dist/build/web/editor.embed.html. Keeping the whole pyret-embed subtree
  ; was fine when it arrived as a registry tarball. In the monorepo pyret-embed
  ; is a symlink to ../embed, `raco pollen publish` follows symlinks, and
  ; embed's own node_modules carries a file: dependency on code.pyret.org --
  ; which carries `pyret -> ../lang`. Publishing that subtree is ~1GB of
  ; compiler source on a public website.
  (define (keep-embed-dist? ps)
    (define tail (node-modules-tail ps))
    (and tail
         (or (string=? tail "")                        ; node_modules itself
             (string=? tail "/pyret-embed")            ; and the one package
             (string-prefix? tail "/pyret-embed/dist"))))
  (define (omitted-path? p) 
    (define ps (path->string p))
    (or (and (string-contains? ps "node_modules")
             (not (keep-embed-dist? ps)))
        (keep-subdir ps "site" "js")
        (string-suffix? ps "typescript"))))

(provide link/new-tab)

(define (link/new-tab url . bodies)
  `(a ([href ,url]
       [target "_blank"])
      ,@bodies))
