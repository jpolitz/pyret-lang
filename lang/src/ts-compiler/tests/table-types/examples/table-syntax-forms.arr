#|
   Pyret's table *syntax* under the new types.

   These forms used to be expanded into raw-array plumbing before the type
   checker ever saw them, so nothing about them could be checked.  They now
   survive `desugar` and are type checked directly (the expansion happens
   afterwards, in desugar-post-tc, and is byte-for-byte the old one), which is
   what makes the schemas below computable:

     table:      the declared header annotations are the sorts; an
                 un-annotated column's sort is the least upper bound of its
                 cells
     extend      binds the named columns to their sorts, and appends the new
                 columns -- with a "this column already exists" error
     transform   replaces the sorts of the columns it updates
     select      projects, computing the exact result schema
     extract     produces a List of the column's sort
     order       keeps the schema, and checks that the sort keys exist
     sieve       keeps the schema, binds the named columns, and requires the
                 predicate to be a Boolean
|#

import lists as L
import tables as T

# --- table: with explicit sorts -------------------------------------------
t = table: name :: String, age :: Number, city :: String
  row: "Bob", 12, "Providence"
  row: "Alice", 17, "Boston"
  row: "Eve", 13, "Providence"
end

names :: List<String> = t.column("name")

# --- table: with inferred sorts -------------------------------------------
# Without annotations a column's sort is inferred from its cells, using the
# same "meet" the checker uses for the branches of an `if` or the elements of
# an array.  A column whose cells disagree is therefore an error unless it is
# annotated `Any` explicitly, which is what `mixed` does here.
inferred = table: score, note, mixed :: Any
  row: 1, "a", 1
  row: 2, "b", "two"
end

scores :: List<Number> = inferred.column("score")
notes :: List<String> = inferred.column("note")
mixed :: List<Any> = inferred.column("mixed")

# --- extend ---------------------------------------------------------------
extended :: Table<{name :: String, age :: Number, city :: String},
                  {is-teen :: Boolean}, {label :: String}> =
  extend t using name, age:
    is-teen: (age >= 13) and (age <= 19),
    label: name + ", " + tostring(age)
  end

teens :: List<Boolean> = extended.column("is-teen")
labels :: List<String> = extended.column("label")

# --- extend with a reducer -------------------------------------------------
# The new column's sort comes from the reducer's own output type
# (Reducer<Acc, In, Out> -> Out), and the reducer's input type has to match
# the sort of the column it runs over.
running :: Table<{name :: String, age :: Number, city :: String},
                 {total-age :: Number}> =
  extend t using age:
    total-age: T.running-sum of age
  end

totals :: List<Number> = running.column("total-age")

# --- transform -------------------------------------------------------------
# `transform` may change a column's sort, and the result type follows.
retyped :: Table<{name :: String, age :: String, city :: String}> =
  transform t using age:
    age: tostring(age)
  end

age-strings :: List<String> = retyped.column("age")

# --- select ----------------------------------------------------------------
projected :: Table<{city :: String, name :: String}> = select city, name from t end
cities :: List<String> = projected.column("city")

# --- extract ---------------------------------------------------------------
just-ages :: List<Number> = extract age from t end

# --- order -----------------------------------------------------------------
ordered :: Table<{name :: String, age :: Number, city :: String}> =
  order t: city ascending, age descending end

# --- sieve -----------------------------------------------------------------
providence :: Table<{name :: String, age :: Number, city :: String}> =
  sieve t using city: city == "Providence" end

# --- and they compose ------------------------------------------------------
summary :: List<String> =
  extract label from
    extend (sieve t using age: age > 12 end) using name, city:
      label: name + " of " + city
    end
  end

count :: Number = L.length(summary)
