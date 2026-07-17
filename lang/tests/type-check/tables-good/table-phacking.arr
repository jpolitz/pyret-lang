# B2T2 pHacking (typed at the concrete jelly schema; the fully generic
# version needs "all columns are Boolean" constraints, which this type
# system does not express) and brownJellybeans (corrected), which closes
# over a Col-typed parameter; and B2T2 employeeToDepartment (corrected).
import lists as L

type JellySchema = {get-acne :: Boolean, red :: Boolean, black :: Boolean}
fun fisher-test(bs1 :: List<Boolean>, bs2 :: List<Boolean>) -> Number: 0.01 end

fun p-hacking(t :: Table<JellySchema>) -> List<String>:
  col-acne = t.get-column("get-acne")
  jelly-cols = t.drop("get-acne")
  for L.fold(found from [list: ], c from jelly-cols.column-names()):
    col-jb = jelly-cols.get-column(c)
    p = fisher-test(col-acne, col-jb)
    if p < 0.05: L.link(c, found) else: found end
  end
end

fun count-participants<S>(t :: Table<S>, color :: Col<S, Boolean>) -> Number:
  keep = lam(r :: Row<S>) -> Boolean: r.get-value(color) end
  t.filter(keep).length()
end

fun dept-id-to-dept-name(
    dept-tab :: Table<{dept-id :: Number, dept-name :: String}>,
    dept-id :: Number) -> String:
  matched = dept-tab.filter(lam(r): r["dept-id"] == dept-id end)
  matched.row-n(0)["dept-name"]
end
fun employee-to-department(
    name :: String,
    empl-tab :: Table<{last-name :: String, dept-id :: Number}>,
    dept-tab :: Table<{dept-id :: Number, dept-name :: String}>) -> String:
  matched = empl-tab.filter(lam(r): r["last-name"] == name end)
  dept-id-to-dept-name(dept-tab, matched.row-n(0)["dept-id"])
end

jelly = table: get-acne, red, black
  row: true, false, true
  row: false, true, true
end
employees = table: last-name, dept-id
  row: "Rafferty", 31
  row: "Jones", 33
end
departments = table: dept-id, dept-name
  row: 31, "Sales"
  row: 33, "Engineering"
end

check:
  p-hacking(jelly) is [list: "black", "red"]
  count-participants(jelly, "red") is 1
  employee-to-department("Jones", employees, departments) is "Engineering"
end
