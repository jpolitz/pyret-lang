# Student-style: minimax over tic-tac-toe boards represented as lists.

data Player:
  | x-player
  | o-player
  | nobody
end

fun other(p :: Player) -> Player:
  cases(Player) p:
    | x-player => o-player
    | o-player => x-player
    | nobody => nobody
  end
end

lines = [list: [list: 0, 1, 2], [list: 3, 4, 5], [list: 6, 7, 8], [list: 0, 3, 6],
  [list: 1, 4, 7], [list: 2, 5, 8], [list: 0, 4, 8], [list: 2, 4, 6]]

fun winner(board :: List<Player>) -> Player:
  for fold(acc from nobody, ln from lines):
    if not(is-nobody(acc)): acc
    else:
      a = board.get(ln.get(0))
      b = board.get(ln.get(1))
      c = board.get(ln.get(2))
      if not(is-nobody(a)) and (a == b) and (b == c): a else: nobody end
    end
  end
end

fun set-at(board :: List<Player>, i :: Number, p :: Player) -> List<Player>:
  for map_n(j from 0, cell from board):
    if j == i: p else: cell end
  end
end

fun score(board :: List<Player>, turn :: Player) -> Number:
  w = winner(board)
  if is-x-player(w): 1
  else if is-o-player(w): -1
  else:
    moves = for filter(i from range(0, 9)): is-nobody(board.get(i)) end
    if is-empty(moves): 0
    else:
      scores = for map(m from moves): score(set-at(board, m, turn), other(turn)) end
      if is-x-player(turn): scores.foldl(num-max, -2)
      else: scores.foldl(num-min, 2)
      end
    end
  end
end

start = for map(_ from range(0, 9)): nobody end
b1 = set-at(start, 4, x-player)
b2 = set-at(b1, 0, o-player)
print("checksum: " + num-to-string(score(b2, x-player) + 10) + "\n")
