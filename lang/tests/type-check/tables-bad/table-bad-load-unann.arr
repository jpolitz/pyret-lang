# load-table requires column annotations in typed code
import csv as CSV
t = load-table: name, age
  source: CSV.csv-table-str("name,age\nBob,12", CSV.default-options)
end
