# typed table functions provided by another module (schema serialization)
import file("support/tablib.arr") as TL

m :: Number = TL.col-mean(TL.gradebook, "age")
t2 :: Table<TL.GB> = TL.gradebook

check:
  m is 14
  t2.get-column("name").length() is 2
end
