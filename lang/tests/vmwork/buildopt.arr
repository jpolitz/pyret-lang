import option as O

check "build-opt":
  fun slowly(n):
    if n <= 0: nothing
    else: slowly(n - 1)
    end
  end
  fun slow(i) block:
    slowly(3000)
    if num-modulo(i, 2) == 0:
      O.some(i)
    else:
      O.none
    end
  end
  arr2 = raw-array-build-opt(slow, 1000)
  raw-array-length(arr2) is 500
end
