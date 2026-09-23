# Student-style: word frequencies with string-dicts and a data type.
import string-dict as SD

data WordCount:
  | wc(word :: String, count :: Number)
end

fun make-text(n :: Number) -> String:
  words = [list: "the", "cat", "sat", "on", "a", "mat", "and", "dog", "ran", "far", "away", "fast"]
  for fold(acc from "", i from range(0, n)):
    w = words.get(num-modulo((i * 7) + num-floor(i / 13), words.length()))
    acc + w + " "
  end
end

fun count-words(text :: String) -> SD.MutableStringDict<Number> block:
  d = [SD.mutable-string-dict:]
  for each(w from string-split-all(text, " ")):
    when string-length(w) > 0:
      d.set-now(w, d.get-now(w).or-else(0) + 1)
    end
  end
  d
end

fun top-words(d) -> List<WordCount>:
  counts = for map(k from d.keys-list-now()): wc(k, d.get-value-now(k)) end
  counts.sort-by(lam(a, b): a.count > b.count end, lam(a, b): a.count == b.count end)
end

var total = 0
for each(k from range(0, 12)) block:
  d = count-words(make-text(8000 + k))
  tops = top-words(d)
  total := total + tops.first.count + tops.length()
  total := total + for fold(acc from 0, w from tops): acc + (string-length(w.word) * w.count) end
end
print("checksum: " + num-to-string(total) + "\n")
