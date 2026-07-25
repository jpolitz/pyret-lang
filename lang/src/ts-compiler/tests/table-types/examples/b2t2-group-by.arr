#|
   b2t2 example programs: groupByRetentive and groupBySubtractive.

   "This example categorizes rows of an input table into groups based on the
    values present in a key column.  The output table includes [/ does not
    include] the key column. ... its purpose is to test that user-defined code
    is no less expressive than api code."

   Both are written schema-polymorphically, so the key column's *name* and
   *sort* travel into the result type:

     group-by-retentive :: <S, C, T>
       (Table<S>, Column<S, C, T>) -> Table<{C; T}, {groups :: Table<S>}>

   Read `Table<{C; T}, {groups :: Table<S>}>` as: a table whose first column
   is named C and holds values of sort T, followed by a `groups` column whose
   cells are themselves tables with the input schema.  Note that the sort of a
   cell here is another table -- b2t2 section 3.1 explicitly allows that.

   The subtractive version drops the key column from each group; because the
   name being dropped is only known as the variable C, the group tables get
   the sound-but-imprecise type `Table` (see DESIGN.md, "Not reasonably
   typable").
|#

import lists as L

fun distinct<A>(l :: List<A>) -> List<A>:
  L.fold(lam(acc :: List<A>, x :: A) -> List<A>:
      if L.member(acc, x): acc else: L.append(acc, [list: x]) end
    end, empty, l)
end

fun group-by-retentive<S, C, T>(t :: Table<S>, key :: Column<S, C, T>)
  -> Table<{C; T}, {groups :: Table<S>}>:
  keys = t.select-columns([list: key])
  # one row per key value
  uniq = keys.filter(lam(r :: Row<{C; T}>) -> Boolean: true end)
  uniq.build-column("groups", lam(kr :: Row<{C; T}>) -> Table<S>:
      t.filter(lam(r :: Row<S>) -> Boolean: r.get-value(key) == kr.get-value(key) end)
    end)
end

fun group-by-subtractive<S, C, T>(t :: Table<S>, key :: Column<S, C, T>)
  -> Table<{C; T}, {groups :: Table}>:
  keys = t.select-columns([list: key])
  keys.build-column("groups", lam(kr :: Row<{C; T}>) -> Table:
      t.filter(lam(r :: Row<S>) -> Boolean: r.get-value(key) == kr.get-value(key) end)
        .drop(key)
    end)
end

type Jelly = Table<{name :: String, color :: String, count :: Number}>

jelly :: Jelly =
  table: name :: String, color :: String, count :: Number
    row: "Emily", "red", 3
    row: "Jacob", "black", 1
    row: "Emma", "red", 5
  end

by-color :: Table<{color :: String}, {groups :: Jelly}> =
  group-by-retentive(jelly, "color")

# the key column keeps its own name and sort in the result
colors :: List<String> = by-color.column("color")
groups :: List<Jelly> = by-color.column("groups")

# ... and the grouped tables still know their own schema
first-group :: Jelly = by-color.row-n(0)["groups"]
first-counts :: List<Number> = first-group.column("count")

by-count :: Table<{count :: Number}, {groups :: Jelly}> =
  group-by-retentive(jelly, "count")
counts :: List<Number> = by-count.column("count")

subtractive :: Table<{color :: String}, {groups :: Table}> =
  group-by-subtractive(jelly, "color")

# `distinct` is only here so the example is honest about what it computes;
# the interesting part is entirely in the types above.
distinct-colors :: List<String> = distinct(jelly.column("color"))
