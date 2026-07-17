# B2T2 blackAndWhite: the column "black and white" does not exist
jelly = table: get-acne, black, white
  row: true, false, true
end
eat-bw = jelly.build-column("eat black and white", lam(r): r["black and white"] == true end)
