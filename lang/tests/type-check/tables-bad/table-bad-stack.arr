# stacking tables with different schemas
t1 = table: a, b row: 1, true end
t2 = table: a, c row: 1, "x" end
x = t1.stack(t2)
