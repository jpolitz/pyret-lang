# load-table: in typed code every column needs an annotation; sanitizers
# also dynamically enforce the annotated sorts
import csv as CSV
import data-source as DS

students = load-table: name :: String, age :: Number
  source: CSV.csv-table-str("name,age\nBob,12\nAlice,17\nEve,13", CSV.default-options)
  sanitize name using DS.string-sanitizer
  sanitize age using DS.strict-num-sanitizer
end

ages :: List<Number> = students.get-column("age")
older = sieve students using age: age > 12 end

check:
  ages is [list: 12, 17, 13]
  older.length() is 2
end
