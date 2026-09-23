big = 12345678901234567890
s = for fold(acc from 0, i from range(0, 300000)): acc + big end
print(s)
