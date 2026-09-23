fun loop(i, acc): if i == 0: acc else: loop(i - 1, num-modulo((acc * 31) + i, 1000003)) end end
print(loop(3000000, 0))
