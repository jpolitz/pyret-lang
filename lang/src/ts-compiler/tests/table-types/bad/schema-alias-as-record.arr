#:expect schema alias has to be written as a table type
type S = {a :: Number}
t :: Table<S> = table: a :: Number row: 1 end
