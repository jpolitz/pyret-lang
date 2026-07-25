#|
   Tables from outside the program.

   b2t2 section 3.2: "we ignore input-output: the benchmark does not stipulate
   how tables are entered into programs."  Pyret's answer is `load-table:`,
   and the type checker's answer here is the one the task allows: for table
   data that comes from an unknown source, the schema is whatever the
   programmer *annotates* on the header, and any header without an annotation
   gets sort `Any`.

   So this is a checked promise, not an inference: the `sanitize` clauses are
   what make it true at run time, and the annotations are what let the rest of
   the program be type checked against it.

   (The source below is a locally written data source rather than
   `csv.csv-table(...)` only because the `csv` trove is compiled without type
   checking, so all of its exports have type `Any`, and this type checker
   refuses to apply a value of type `Any`.  That is a pre-existing property of
   the checker, unrelated to tables; see DESIGN.md.)
|#

import data-source as DS

rows = [raw-array:
    [raw-array: "Bob", "12", "true"],
    [raw-array: "Alice", "17", "false"]
  ]

# Any object with a `load` method is a data source, as far as `load-table:` is
# concerned.
people-source = {
  method load(self, headers :: RawArray<String>, sanitizers :: RawArray<Any>) -> Any:
    raise("this example is only type checked, not run")
  end
}

# Fully annotated: downstream code sees a real schema.
type People = Table<{name :: String, age :: Number, member :: Boolean}>

people :: People =
  load-table: name :: String, age :: Number, member :: Boolean
    source: people-source
    sanitize age using DS.num-sanitizer
    sanitize member using DS.bool-sanitizer
  end

ages :: List<Number> = people.column("age")
members :: List<Boolean> = people.column("member")

adults :: People = sieve people using age: age >= 18 end

by-age :: People = order people: age descending end

oldest-name :: String = by-age.row-n(0)["name"]

# Partly annotated: the un-annotated columns have sort `Any`, and stay `Any`
# until the program narrows them itself.  Nothing is guessed.
partly =
  load-table: name :: String, age, member
    source: people-source
  end

names :: List<String> = partly.column("name")
unknown-ages :: List<Any> = partly.column("age")

# A loaded table is an ordinary table type, so it composes with everything
# else: here it picks up a derived column and keeps its schema.
with-decade :: Table<People, {decade :: Number}> =
  people.build-column("decade", lam(r :: Row<People>) -> Number:
      num-floor(r["age"] / 10) * 10
    end)

decades :: List<Number> = with-decade.column("decade")
