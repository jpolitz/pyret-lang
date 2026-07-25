#:expect does not have a column named "black and white"
# b2t2 Errors: "blackAndWhite". The task was `r["black"] and r["white"]`;
# the buggy program reads a column called "black and white" instead.
t = table: get-acne :: Boolean, black :: Boolean, white :: Boolean
  row: true, false, true
end
eat-black-and-white =
  lam(r :: Row<{get-acne :: Boolean, black :: Boolean, white :: Boolean}>) -> Boolean:
    r["black and white"] == true
  end
answer = t.build-column("eat black and white", eat-black-and-white)
