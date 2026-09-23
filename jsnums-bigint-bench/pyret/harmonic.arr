h = for fold(acc from 0, k from range(1, 1501)): acc + (1 / k) end
print(string-length(num-to-string(h)))
