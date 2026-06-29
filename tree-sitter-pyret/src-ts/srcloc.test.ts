import { PositionMap } from "./srcloc.ts";
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}` + (ok ? "" : ` got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
}
const m1 = new PositionMap("ab\ncd");
check("ascii a", m1.posFromBytes(0,1), {startRow:1,startCol:0,startChar:0,endRow:1,endCol:1,endChar:1});
check("ascii c", m1.posFromBytes(3,4), {startRow:2,startCol:0,startChar:3,endRow:2,endCol:1,endChar:4});
check("ascii whole", m1.posFromBytes(0,5), {startRow:1,startCol:0,startChar:0,endRow:2,endCol:2,endChar:5});
const m2 = new PositionMap("x\u{1F600}y");
check("emoji y", m2.posFromBytes(5,6), {startRow:1,startCol:3,startChar:3,endRow:1,endCol:4,endChar:4});
check("emoji span", m2.posFromBytes(1,5), {startRow:1,startCol:1,startChar:1,endRow:1,endCol:3,endChar:3});
