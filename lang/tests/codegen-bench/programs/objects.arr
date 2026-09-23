fun make-counter(start):
  {
    n: start,
    method inc(self, k): make-counter(self.n + k) end,
    method get(self): self.n end
  }
end

data Point:
  | pt(x, y) with:
    method add(self, other): pt(self.x + other.x, self.y + other.y) end,
    method scale(self, k): pt(self.x * k, self.y * k) end,
    method norm1(self): num-abs(self.x) + num-abs(self.y) end
end

var c = make-counter(0)
for each(i from range(0, 200000)):
  c := c.inc(i)
end
var p = pt(0, 0)
for each(i from range(0, 200000)):
  p := p.add(pt(i, 0 - i)).scale(1)
end
o = { a: 1, b: 2 }
var s = 0
for each(i from range(0, 200000)) block:
  o2 = o.{ a: i }
  s := s + o2.a + o2.b
end
print("checksum: " + num-to-string(c.get() + p.norm1() + s) + "\n")
