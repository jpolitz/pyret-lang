define(["js/runtime-util","js/type-util"],function(util,t) {
return util.definePyretModule("file://.//src/scripts/show-compilation.arr",[util.modBuiltin("arrays"),
util.modBuiltin("ast"),
util.modBuiltin("cmdline"),
util.modBuiltin("error"),
util.modBuiltin("file"),
util.modBuiltin("lists"),
util.modBuiltin("option"),
util.modBuiltin("parse-pyret"),
util.modBuiltin("sets"),
util.modBuiltin("string-dict"),
{"protocol":"legacy-path",
"args":["compiler/anf.arr"]},
{"protocol":"legacy-path",
"args":["compiler/ast-anf.arr"]},
{"protocol":"legacy-path",
"args":["compiler/ast-util.arr"]},
{"protocol":"legacy-path",
"args":["compiler/compile-structs.arr"]},
{"protocol":"legacy-path",
"args":["compiler/compile.arr"]},
{"protocol":"legacy-path",
"args":["compiler/desugar-check.arr"]},
{"protocol":"legacy-path",
"args":["compiler/desugar-check.arr"]},
{"protocol":"legacy-path",
"args":["compiler/desugar.arr"]},
{"protocol":"legacy-path",
"args":["compiler/js-of-pyret.arr"]},
{"protocol":"legacy-path",
"args":["compiler/resolve-scope.arr"]}],{"values":{"options":t.any,
"parsed-options":t.any},
"aliases":{},
"datatypes":{}},function(R,NAMESPACE,$arrays441051,$A241152,$C141253,$error1011354,$F421455,$lists561556,$option931657,$P161758,$sets1031859,$SD181960,$N362061,$AN342162,$U322263,$CS282364,$CM262465,$DC222566,$CH402667,$D202768,$JS382869,$R302970) {
var G = R.getFieldLoc;
var U = function(loc,name) {
R.ffi.throwUninitializedIdMkLoc(loc,name)};
var M = "file://.//src/scripts/show-compilation.arr";
var D = R.undefined;
var L = [[M,19,11,510,19,25,524],
[M,21,23,560,21,31,568],
[M,21,48,585,21,54,591],
[M,23,11,652,23,17,658],
[M,25,11,741,25,17,747],
[M,27,11,817,27,17,823],
[M,36,9,1021,36,42,1054],
[M,37,8,1064,37,27,1083],
[M,39,8,1104,39,26,1122],
[M,45,17,1282,45,45,1310],
[M,45,8,1273,45,13,1278],
[M,51,29,1464,51,37,1472],
[M,51,60,1495,51,80,1515],
[M,62,16,1820,62,26,1830],
[M,63,23,1861,63,35,1873],
[M,63,13,1851,63,36,1874],
[M,63,50,1888,63,62,1900],
[M,63,38,1876,63,94,1932],
[M,64,27,1960,64,39,1972],
[M,64,10,1943,64,98,2031],
[M,64,54,1987,64,66,1999],
[M,64,42,1975,64,98,2031],
[M,65,41,2073,65,53,2085],
[M,65,10,2042,65,107,2139],
[M,65,62,2094,65,74,2106],
[M,65,56,2088,65,107,2139],
[M,66,36,2176,66,48,2188],
[M,66,10,2150,66,111,2251],
[M,66,63,2203,66,75,2215],
[M,66,51,2191,66,111,2251],
[M,67,35,2287,67,47,2299],
[M,67,10,2262,77,15,2770],
[M,68,36,2338,68,48,2350],
[M,70,19,2396,70,31,2408],
[M,70,33,2410,70,78,2455],
[M,70,45,2422,70,77,2454],
[M,71,16,2472,71,91,2547],
[M,71,51,2507,71,91,2547],
[M,71,57,2513,71,90,2546],
[M,74,18,2649,74,34,2665],
[M,74,24,2655,74,33,2664],
[M,73,18,2588,73,60,2630],
[M,71,24,2480,71,49,2505],
[M,69,16,2368,69,21,2373],
[M,76,33,2719,76,68,2754],
[M,76,45,2731,76,67,2753],
[M,76,16,2702,76,29,2715],
[M,68,12,2314,77,15,2770],
[M,68,18,2320,68,34,2336],
[M,80,25,2859,80,37,2871],
[M,80,12,2846,80,39,2873],
[M,80,18,2852,80,38,2872],
[M,79,12,2799,79,46,2833],
[M,67,18,2270,67,48,2300],
[M,66,18,2158,66,49,2189],
[M,65,18,2050,65,54,2086],
[M,64,18,1951,64,40,1973],
[M,62,10,1814,62,33,1837],
[M,61,10,1776,61,37,1803],
[M,60,8,1739,82,11,2899],
[M,51,15,1450,58,21,1729],
[M,49,8,1424,49,17,1433],
[M,48,24,1393,48,46,1415],
[M,47,8,1344,47,32,1368],
[M,47,14,1350,47,31,1367],
[M,46,8,1319,46,21,1332],
[M,44,4,1246,83,7,2907],
[M,44,11,1253,44,15,1257],
[M,43,4,1225,43,20,1241],
[M,42,17,1194,42,43,1220],
[M,41,17,1150,41,43,1176],
[M,34,18,977,34,41,1000],
[M,34,4,963,34,41,1000],
[M,33,4,936,33,23,955],
[M,85,4,2935,85,66,2997],
[M,85,35,2966,85,65,2996],
[M,85,43,2974,85,64,2995],
[M,85,18,2949,85,31,2962],
[M,84,4,2912,84,19,2927],
[M,32,0,890,86,3,3001],
[M,19,0,499,87,17,3019],
[M,87,0,3002,87,17,3019],
[M,32,7,897,32,24,914],
[M,30,17,864,30,41,888],
[M,19,10,509,28,1,845],
[M,27,4,810,27,37,843],
[M,25,4,734,25,58,788],
[M,23,4,645,23,71,712],
[M,21,4,541,21,79,616],
[M,21,37,574,21,46,583],
[M,3,0,13,87,17,3019]];
var _plus1 = NAMESPACE.get("_plus");
var print2 = NAMESPACE.get("print");
var torepr3 = NAMESPACE.get("torepr");
var tostring4 = NAMESPACE.get("tostring");
var builtins5 = NAMESPACE.get("builtins");
var arrays4410 = R.getField($arrays441051,"values");
var A2411 = R.getField($A241152,"values");
var C1412 = R.getField($C141253,"values");
var error10113 = R.getField($error1011354,"values");
var F4214 = R.getField($F421455,"values");
var lists5615 = R.getField($lists561556,"values");
var option9316 = R.getField($option931657,"values");
var P1617 = R.getField($P161758,"values");
var sets10318 = R.getField($sets1031859,"values");
var SD1819 = R.getField($SD181960,"values");
var N3620 = R.getField($N362061,"values");
var AN3421 = R.getField($AN342162,"values");
var U3222 = R.getField($U322263,"values");
var CS2823 = R.getField($CS282364,"values");
var CM2624 = R.getField($CM262465,"values");
var DC2225 = R.getField($DC222566,"values");
var CH4026 = R.getField($CH402667,"values");
var D2027 = R.getField($D202768,"values");
var JS3828 = R.getField($JS382869,"values");
var R3029 = R.getField($R302970,"values");
var arrays4530 = R.getField($arrays441051,"types");
var A2531 = R.getField($A241152,"types");
var C1532 = R.getField($C141253,"types");
var error10233 = R.getField($error1011354,"types");
var F4334 = R.getField($F421455,"types");
var lists5735 = R.getField($lists561556,"types");
var option9436 = R.getField($option931657,"types");
var P1737 = R.getField($P161758,"types");
var sets10438 = R.getField($sets1031859,"types");
var SD1939 = R.getField($SD181960,"types");
var N3740 = R.getField($N362061,"types");
var AN3541 = R.getField($AN342162,"types");
var U3342 = R.getField($U322263,"types");
var CS2943 = R.getField($CS282364,"types");
var CM2744 = R.getField($CM262465,"types");
var DC2345 = R.getField($DC222566,"types");
var CH4146 = R.getField($CH402667,"types");
var D2147 = R.getField($D202768,"types");
var JS3948 = R.getField($JS382869,"types");
var R3149 = R.getField($R302970,"types");
NAMESPACE = R.addModuleToNamespace(NAMESPACE,["array-to-list-now","array-length","array-get-now","array-set-now","array-of","is-array","array-from-list","build-array","array"],["Array"],$arrays441051);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$A241152);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$C141253);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$error1011354);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$F421455);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,["index","fold4","fold3","fold2","fold","each4_n","each3_n","each2_n","each_n","each4","each3","each2","each","map4_n","map3_n","map2_n","map_n","map4","map3","map2","map","find","any","split-at","partition","filter","repeat","range-by","range","link","empty","is-link","is-empty","list"],["List"],$lists561556);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,["some","none","is-some","is-none","Option"],["Option"],$option931657);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$P161758);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,["list-set","tree-set","set"],["Set"],$sets1031859);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$SD181960);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$N362061);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$AN342162);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$U322263);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$CS282364);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$CM262465);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$DC222566);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$CH402667);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$D202768);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$JS382869);
NAMESPACE = R.addModuleToNamespace(NAMESPACE,[],[],$R302970);
var some996 = NAMESPACE.get("some");
var link627 = NAMESPACE.get("link");
var each798 = NAMESPACE.get("each");
var List929 = NAMESPACE.get("$type$List");
var $toplevel7374 = function($resumer77648) {
var $step7172 = 0;
var $ans7879 = D;
var $al8081 = L[90];
try {
if(R.isActivationRecord($resumer77648)) {
var $ar651652 = $resumer77648;
$step7172 = $ar651652.step;
$al8081 = $ar651652.from;
$ans7879 = $ar651652.ans;
$resumer77648 = $ar651652.args[0];
checks196647 = $ar651652.vars[0];
field455644 = $ar651652.vars[1];
obj454643 = $ar651652.vars[2];
anf_method_obj195642 = $ar651652.vars[3];
field453641 = $ar651652.vars[4];
obj452640 = $ar651652.vars[5];
provides194645 = $ar651652.vars[6];
answer193646 = $ar651652.vars[7];
$temp_branch624625 = $ar651652.vars[8];
$temp_branch389390 = $ar651652.vars[9];
cases_dispatch451639 = $ar651652.vars[10];
cases127108 = $ar651652.vars[11];
parsed_DASH_options110107 = $ar651652.vars[12];
field208106 = $ar651652.vars[13];
obj207105 = $ar651652.vars[14];
options109104 = $ar651652.vars[15];
field206103 = $ar651652.vars[16];
obj205102 = $ar651652.vars[17];
anf_arg142101 = $ar651652.vars[18];
anf_array_val14199 = $ar651652.vars[19];
field20495 = $ar651652.vars[20];
obj20394 = $ar651652.vars[21];
anf_arg14093 = $ar651652.vars[22];
anf_array_val13998 = $ar651652.vars[23];
field20292 = $ar651652.vars[24];
obj20191 = $ar651652.vars[25];
anf_arg13890 = $ar651652.vars[26];
anf_array_val13797 = $ar651652.vars[27];
field20089 = $ar651652.vars[28];
obj19988 = $ar651652.vars[29];
anf_arg13687 = $ar651652.vars[30];
anf_array_val13596 = $ar651652.vars[31];
field19886 = $ar651652.vars[32];
obj19785 = $ar651652.vars[33];
anf_arg13484 = $ar651652.vars[34];
anf_arg13383 = $ar651652.vars[35];
anf_arg13282 = $ar651652.vars[36];
anf_method_obj131100 = $ar651652.vars[37];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step7172) {
case 0: var anf_method_obj131100 = G(SD1819,"string-dict",L[0]);
var anf_arg13282 = G(C1412,"Number",L[1]);
if(!(R.isFunction(some996))) {
R.ffi.throwNonFunApp(L[89],some996);
}
$step7172 = 1;
$al8081 = L[89];
$ans7879 = some996.app(("w"));
break;
case 1: var anf_arg13383 = $ans7879;
var anf_arg13484 = G(C1412,"once",L[2]);
$step7172 = 2;
$al8081 = L[88];
var obj19785 = C1412;
var field19886 = R.getColonField(obj19785,"next-val-default");
if(R.isMethod(field19886)) {
$ans7879 = field19886.full_meth(obj19785,anf_arg13282,(80),anf_arg13383,anf_arg13484,("Pretty-printed width"));
} else {
if(!(R.isFunction(field19886))) {
R.ffi.throwNonFunApp(L[88],field19886);
}
$ans7879 = field19886.app(anf_arg13282,(80),anf_arg13383,anf_arg13484,("Pretty-printed width"));
}
break;
case 2: var anf_array_val13596 = $ans7879;
var anf_arg13687 = G(C1412,"once",L[3]);
$step7172 = 3;
$al8081 = L[87];
var obj19988 = C1412;
var field20089 = R.getColonField(obj19988,"flag");
if(R.isMethod(field20089)) {
$ans7879 = field20089.full_meth(obj19988,anf_arg13687,("Use standard buildins instead of minimal builtins"));
} else {
if(!(R.isFunction(field20089))) {
R.ffi.throwNonFunApp(L[87],field20089);
}
$ans7879 = field20089.app(anf_arg13687,("Use standard buildins instead of minimal builtins"));
}
break;
case 3: var anf_array_val13797 = $ans7879;
var anf_arg13890 = G(C1412,"once",L[4]);
$step7172 = 4;
$al8081 = L[86];
var obj20191 = C1412;
var field20292 = R.getColonField(obj20191,"flag");
if(R.isMethod(field20292)) {
$ans7879 = field20292.full_meth(obj20191,anf_arg13890,("Compile code with check-mode enabled"));
} else {
if(!(R.isFunction(field20292))) {
R.ffi.throwNonFunApp(L[86],field20292);
}
$ans7879 = field20292.app(anf_arg13890,("Compile code with check-mode enabled"));
}
break;
case 4: var anf_array_val13998 = $ans7879;
var anf_arg14093 = G(C1412,"once",L[5]);
$step7172 = 5;
$al8081 = L[85];
var obj20394 = C1412;
var field20495 = R.getColonField(obj20394,"flag");
if(R.isMethod(field20495)) {
$ans7879 = field20495.full_meth(obj20394,anf_arg14093,("Type check code"));
} else {
if(!(R.isFunction(field20495))) {
R.ffi.throwNonFunApp(L[85],field20495);
}
$ans7879 = field20495.app(anf_arg14093,("Type check code"));
}
break;
case 5: var anf_array_val14199 = $ans7879;
var anf_arg142101 = [("width"),anf_array_val13596,("standard-builtins"),anf_array_val13797,("check-mode"),anf_array_val13998,("type-check"),anf_array_val14199];
$step7172 = 6;
$al8081 = L[84];
var obj205102 = anf_method_obj131100;
var field206103 = R.getColonField(obj205102,"make");
if(R.isMethod(field206103)) {
$ans7879 = field206103.full_meth(obj205102,anf_arg142101);
} else {
if(!(R.isFunction(field206103))) {
R.ffi.throwNonFunApp(L[84],field206103);
}
$ans7879 = field206103.app(anf_arg142101);
}
break;
case 6: var options109104 = $ans7879;
$step7172 = 7;
$al8081 = L[83];
var obj207105 = C1412;
var field208106 = R.getColonField(obj207105,"parse-cmdline");
if(R.isMethod(field208106)) {
$ans7879 = field208106.full_meth(obj207105,options109104);
} else {
if(!(R.isFunction(field208106))) {
R.ffi.throwNonFunApp(L[83],field208106);
}
$ans7879 = field208106.app(options109104);
}
break;
case 7: var parsed_DASH_options110107 = $ans7879;
var cases127108 = parsed_DASH_options110107;
$step7172 = 8;
R._checkAnn(L[82],R.getDotAnn(L[82],"C",C1532,"ParsedArguments"),cases127108);
break;
case 8: var cases_dispatch451639 = {"success":9,
"arg-error":10};
$al8081 = L[79];
$step7172 = cases_dispatch451639[cases127108.$name] || 11;
break;
case 9: if(cases127108.$arity >= 0) {
if(2 !== cases127108.$arity) {
R.ffi.throwCasesArityErrorC(L[73],2,cases127108.$arity);
}
} else {
R.ffi.throwCasesSingletonErrorC(L[73],true);
}
$step7172 = 12;
var $temp_branch389390 = function(opts111109,rest112119) {
var $step391392 = 0;
var $ans393394 = D;
var $al395396 = L[72];
try {
if(R.isActivationRecord(opts111109)) {
var $ar616617 = opts111109;
$step391392 = $ar616617.step;
$al395396 = $ar616617.from;
$ans393394 = $ar616617.ans;
opts111109 = $ar616617.args[0];
rest112119 = $ar616617.args[1];
$temp_branch510511 = $ar616617.vars[0];
$temp_branch405406 = $ar616617.vars[1];
cases_dispatch446613 = $ar616617.vars[2];
cases128120 = $ar616617.vars[3];
type_DASH_check116140 = $ar616617.vars[4];
field335404 = $ar616617.vars[5];
obj334403 = $ar616617.vars[6];
check_DASH_mode115139 = $ar616617.vars[7];
field333402 = $ar616617.vars[8];
obj332401 = $ar616617.vars[9];
libs114144 = $ar616617.vars[10];
anf_if144388 = $ar616617.vars[11];
anf_arg143114 = $ar616617.vars[12];
field331400 = $ar616617.vars[13];
obj330399 = $ar616617.vars[14];
print_DASH_width113170 = $ar616617.vars[15];
field329398 = $ar616617.vars[16];
obj328397 = $ar616617.vars[17];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step391392) {
case 0: $step391392 = 1;
$al395396 = L[71];
var obj328397 = opts111109;
var field329398 = R.getColonField(obj328397,"get-value");
if(R.isMethod(field329398)) {
$ans393394 = field329398.full_meth(obj328397,("width"));
} else {
if(!(R.isFunction(field329398))) {
R.ffi.throwNonFunApp(L[71],field329398);
}
$ans393394 = field329398.app(("width"));
}
break;
case 1: var print_DASH_width113170 = $ans393394;
$step391392 = 2;
$al395396 = L[6];
var obj330399 = opts111109;
var field331400 = R.getColonField(obj330399,"has-key");
if(R.isMethod(field331400)) {
$ans393394 = field331400.full_meth(obj330399,("standard-builtins"));
} else {
if(!(R.isFunction(field331400))) {
R.ffi.throwNonFunApp(L[6],field331400);
}
$ans393394 = field331400.app(("standard-builtins"));
}
break;
case 2: var anf_arg143114 = $ans393394;
$al395396 = L[6];
var anf_if144388 = R.checkWrapBoolean(anf_arg143114);
if(R.isPyretTrue(anf_if144388)) {
$step391392 = 3;
} else {
$step391392 = 4;
}
break;
case 3: $step391392 = 5;
$ans393394 = G(CS2823,"standard-imports",L[7]);
break;
case 4: $step391392 = 5;
$ans393394 = G(CS2823,"minimal-imports",L[8]);
break;
case 5: var libs114144 = $ans393394;
$step391392 = 6;
$al395396 = L[70];
var obj332401 = opts111109;
var field333402 = R.getColonField(obj332401,"has-key");
if(R.isMethod(field333402)) {
$ans393394 = field333402.full_meth(obj332401,("check-mode"));
} else {
if(!(R.isFunction(field333402))) {
R.ffi.throwNonFunApp(L[70],field333402);
}
$ans393394 = field333402.app(("check-mode"));
}
break;
case 6: var check_DASH_mode115139 = $ans393394;
$step391392 = 7;
$al395396 = L[69];
var obj334403 = opts111109;
var field335404 = R.getColonField(obj334403,"has-key");
if(R.isMethod(field335404)) {
$ans393394 = field335404.full_meth(obj334403,("type-check"));
} else {
if(!(R.isFunction(field335404))) {
R.ffi.throwNonFunApp(L[69],field335404);
}
$ans393394 = field335404.app(("type-check"));
}
break;
case 7: var type_DASH_check116140 = $ans393394;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[68],print2);
}
$step391392 = 8;
$al395396 = L[68];
$ans393394 = print2.app(("Success"));
break;
case 8: var cases128120 = rest112119;
$step391392 = 9;
R._checkAnn(L[67],List929,cases128120);
break;
case 9: var cases_dispatch446613 = {"empty":10,
"link":11};
$al395396 = L[66];
$step391392 = cases_dispatch446613[cases128120.$name] || 12;
break;
case 10: if(cases128120.$arity !== -1) {
R.ffi.throwCasesSingletonErrorC(L[10],false);
}
$step391392 = 13;
var $temp_branch405406 = function($resumer407414) {
var $step408409 = 0;
var $ans410411 = D;
var $al412413 = L[9];
try {
if(R.isActivationRecord($resumer407414)) {
var $ar417418 = $resumer407414;
$step408409 = $ar417418.step;
$al412413 = $ar417418.from;
$ans410411 = $ar417418.ans;
$resumer407414 = $ar417418.args[0];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step408409) {
case 0: if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[9],print2);
}
$step408409 = 1;
$al412413 = L[9];
$ans410411 = print2.app(("Require a file name"));
break;
case 1: ++R.GAS;
return $ans410411;
default: throw "No case numbered " + $step408409 + " in $temp_branch405406";
}
}
} catch($e415416) {
if(R.isCont($e415416) && ($step408409 !== 1)) {
$e415416.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al412413,$temp_branch405406,$step408409,[$resumer407414],[]);
}
if(R.isPyretException($e415416)) {
$e415416.pyretStack.push($al412413);
}
throw $e415416;
}
};
$ans393394 = cases128120.$app_fields($temp_branch405406,[]);
break;
case 11: if(cases128120.$arity >= 0) {
if(2 !== cases128120.$arity) {
R.ffi.throwCasesArityErrorC(L[65],2,cases128120.$arity);
}
} else {
R.ffi.throwCasesSingletonErrorC(L[65],true);
}
$step391392 = 13;
var $temp_branch510511 = function(file117135,$underscore118382) {
var $step512513 = 0;
var $ans514515 = D;
var $al516517 = L[64];
try {
if(R.isActivationRecord(file117135)) {
var $ar611612 = file117135;
$step512513 = $ar611612.step;
$al516517 = $ar611612.from;
$ans514515 = $ar611612.ans;
file117135 = $ar611612.args[0];
$underscore118382 = $ar611612.args[1];
anf_arg190281 = $ar611612.vars[0];
$temp_lam526527 = $ar611612.vars[1];
comp120282 = $ar611612.vars[2];
field396523 = $ar611612.vars[3];
obj395522 = $ar611612.vars[4];
anf_method_obj149148 = $ar611612.vars[5];
field394521 = $ar611612.vars[6];
obj393520 = $ar611612.vars[7];
anf_arg148145 = $ar611612.vars[8];
anf_arg147143 = $ar611612.vars[9];
anf_arg146141 = $ar611612.vars[10];
file_DASH_contents119142 = $ar611612.vars[11];
field392519 = $ar611612.vars[12];
obj391518 = $ar611612.vars[13];
anf_arg145136 = $ar611612.vars[14];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step512513) {
case 0: if(!(R.isFunction(_plus1))) {
R.ffi.throwNonFunApp(L[64],_plus1);
}
$step512513 = 1;
$al516517 = L[64];
$ans514515 = _plus1.app(("File is "),file117135);
break;
case 1: var anf_arg145136 = $ans514515;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[63],print2);
}
$step512513 = 2;
$al516517 = L[63];
$ans514515 = print2.app(anf_arg145136);
break;
case 2: $step512513 = 3;
$al516517 = L[62];
var obj391518 = F4214;
var field392519 = R.getColonField(obj391518,"file-to-string");
if(R.isMethod(field392519)) {
$ans514515 = field392519.full_meth(obj391518,file117135);
} else {
if(!(R.isFunction(field392519))) {
R.ffi.throwNonFunApp(L[62],field392519);
}
$ans514515 = field392519.app(file117135);
}
break;
case 3: var file_DASH_contents119142 = $ans514515;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[61],print2);
}
$step512513 = 4;
$al516517 = L[61];
$ans514515 = print2.app((""));
break;
case 4: var anf_arg146141 = G(CM2624,"start",L[11]);
var anf_arg147143 = G(CS2823,"standard-builtins",L[12]);
var anf_arg148145 = R.makeObject({"check-mode":check_DASH_mode115139,
"collect-all":(true),
"ignore-unbound":(true),
"type-check":type_DASH_check116140,
"proper-tail-calls":(true)});
$step512513 = 5;
$al516517 = L[60];
var obj393520 = CM2624;
var field394521 = R.getColonField(obj393520,"compile-js");
if(R.isMethod(field394521)) {
$ans514515 = field394521.full_meth(obj393520,anf_arg146141,file_DASH_contents119142,file117135,anf_arg147143,libs114144,anf_arg148145);
} else {
if(!(R.isFunction(field394521))) {
R.ffi.throwNonFunApp(L[60],field394521);
}
$ans514515 = field394521.app(anf_arg146141,file_DASH_contents119142,file117135,anf_arg147143,libs114144,anf_arg148145);
}
break;
case 5: var anf_method_obj149148 = $ans514515;
$step512513 = 6;
$al516517 = L[60];
var obj395522 = anf_method_obj149148;
var field396523 = R.getColonField(obj395522,"tolist");
if(R.isMethod(field396523)) {
$ans514515 = field396523.full_meth(obj395522);
} else {
if(!(R.isFunction(field396523))) {
R.ffi.throwNonFunApp(L[60],field396523);
}
$ans514515 = field396523.app();
}
break;
case 6: var comp120282 = $ans514515;
var $temp_lam526527 = function(phase121155) {
var $step524525 = 0;
var $ans528529 = D;
var $al530531 = L[59];
try {
if(R.isActivationRecord(phase121155)) {
var $ar607608 = phase121155;
$step524525 = $ar607608.step;
$al530531 = $ar607608.from;
$ans528529 = $ar607608.ans;
phase121155 = $ar607608.args[0];
anf_arg189271 = $ar607608.vars[0];
anf_arg188270 = $ar607608.vars[1];
$temp_branch590591 = $ar607608.vars[2];
$temp_branch566567 = $ar607608.vars[3];
cases_dispatch445604 = $ar607608.vars[4];
cases129209 = $ar607608.vars[5];
anf_if178272 = $ar607608.vars[6];
anf_arg177208 = $ar607608.vars[7];
field420555 = $ar607608.vars[8];
obj419554 = $ar607608.vars[9];
anf_arg176205 = $ar607608.vars[10];
anf_arg175204 = $ar607608.vars[11];
field418553 = $ar607608.vars[12];
obj417552 = $ar607608.vars[13];
anf_method_obj174201 = $ar607608.vars[14];
field416551 = $ar607608.vars[15];
obj415550 = $ar607608.vars[16];
anf_method_obj173198 = $ar607608.vars[17];
anf_bracket172197 = $ar607608.vars[18];
anf_if171273 = $ar607608.vars[19];
anf_arg170196 = $ar607608.vars[20];
field414549 = $ar607608.vars[21];
obj413548 = $ar607608.vars[22];
anf_arg169193 = $ar607608.vars[23];
anf_arg168192 = $ar607608.vars[24];
field412547 = $ar607608.vars[25];
obj411546 = $ar607608.vars[26];
anf_method_obj167189 = $ar607608.vars[27];
anf_if166274 = $ar607608.vars[28];
anf_arg165188 = $ar607608.vars[29];
field410545 = $ar607608.vars[30];
obj409544 = $ar607608.vars[31];
anf_arg164185 = $ar607608.vars[32];
anf_arg163184 = $ar607608.vars[33];
field408543 = $ar607608.vars[34];
obj407542 = $ar607608.vars[35];
anf_method_obj162181 = $ar607608.vars[36];
field406541 = $ar607608.vars[37];
obj405540 = $ar607608.vars[38];
anf_method_obj161178 = $ar607608.vars[39];
anf_if160275 = $ar607608.vars[40];
anf_arg159177 = $ar607608.vars[41];
field404539 = $ar607608.vars[42];
obj403538 = $ar607608.vars[43];
anf_arg158174 = $ar607608.vars[44];
anf_arg157173 = $ar607608.vars[45];
field402537 = $ar607608.vars[46];
obj401536 = $ar607608.vars[47];
anf_method_obj156169 = $ar607608.vars[48];
field400535 = $ar607608.vars[49];
obj399534 = $ar607608.vars[50];
anf_method_obj155166 = $ar607608.vars[51];
anf_if154276 = $ar607608.vars[52];
anf_arg153165 = $ar607608.vars[53];
field398533 = $ar607608.vars[54];
obj397532 = $ar607608.vars[55];
anf_arg152162 = $ar607608.vars[56];
anf_arg151161 = $ar607608.vars[57];
anf_arg150160 = $ar607608.vars[58];
} else {
if(arguments.length !== 1) {
R.checkArityC(L[59],1,R.cloneArgs.apply(null,arguments));
}
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step524525) {
case 0: if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[58],print2);
}
$step524525 = 1;
$al530531 = L[58];
$ans528529 = print2.app((">>>>>>>>>>>>>>>>>>"));
break;
case 1: var anf_arg150160 = G(phase121155,"name",L[13]);
if(!(R.isFunction(_plus1))) {
R.ffi.throwNonFunApp(L[13],_plus1);
}
$step524525 = 2;
$al530531 = L[13];
$ans528529 = _plus1.app(anf_arg150160,(":"));
break;
case 2: var anf_arg151161 = $ans528529;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[57],print2);
}
$step524525 = 3;
$al530531 = L[57];
$ans528529 = print2.app(anf_arg151161);
break;
case 3: var anf_arg152162 = G(phase121155,"result",L[14]);
$step524525 = 4;
$al530531 = L[15];
var obj397532 = A2411;
var field398533 = R.getColonField(obj397532,"Program");
if(R.isMethod(field398533)) {
$ans528529 = field398533.full_meth(obj397532,anf_arg152162);
} else {
if(!(R.isFunction(field398533))) {
R.ffi.throwNonFunApp(L[15],field398533);
}
$ans528529 = field398533.app(anf_arg152162);
}
break;
case 4: var anf_arg153165 = $ans528529;
$al530531 = L[15];
var anf_if154276 = R.checkWrapBoolean(anf_arg153165);
if(R.isPyretTrue(anf_if154276)) {
$step524525 = 5;
} else {
$step524525 = 8;
}
break;
case 5: var anf_method_obj155166 = G(phase121155,"result",L[16]);
$step524525 = 6;
$al530531 = L[16];
var obj399534 = anf_method_obj155166;
var field400535 = R.getColonField(obj399534,"tosource");
if(R.isMethod(field400535)) {
$ans528529 = field400535.full_meth(obj399534);
} else {
if(!(R.isFunction(field400535))) {
R.ffi.throwNonFunApp(L[16],field400535);
}
$ans528529 = field400535.app();
}
break;
case 6: var anf_method_obj156169 = $ans528529;
$step524525 = 7;
$al530531 = L[16];
var obj401536 = anf_method_obj156169;
var field402537 = R.getColonField(obj401536,"pretty");
if(R.isMethod(field402537)) {
$ans528529 = field402537.full_meth(obj401536,print_DASH_width113170);
} else {
if(!(R.isFunction(field402537))) {
R.ffi.throwNonFunApp(L[16],field402537);
}
$ans528529 = field402537.app(print_DASH_width113170);
}
break;
case 7: var anf_arg157173 = $ans528529;
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[17],each798);
}
$step524525 = 32;
$al530531 = L[17];
$ans528529 = each798.app(print2,anf_arg157173);
break;
case 8: var anf_arg158174 = G(phase121155,"result",L[18]);
$step524525 = 9;
$al530531 = L[56];
var obj403538 = AN3421;
var field404539 = R.getColonField(obj403538,"AProg");
if(R.isMethod(field404539)) {
$ans528529 = field404539.full_meth(obj403538,anf_arg158174);
} else {
if(!(R.isFunction(field404539))) {
R.ffi.throwNonFunApp(L[56],field404539);
}
$ans528529 = field404539.app(anf_arg158174);
}
break;
case 9: var anf_arg159177 = $ans528529;
$al530531 = L[19];
var anf_if160275 = R.checkWrapBoolean(anf_arg159177);
if(R.isPyretTrue(anf_if160275)) {
$step524525 = 10;
} else {
$step524525 = 13;
}
break;
case 10: var anf_method_obj161178 = G(phase121155,"result",L[20]);
$step524525 = 11;
$al530531 = L[20];
var obj405540 = anf_method_obj161178;
var field406541 = R.getColonField(obj405540,"tosource");
if(R.isMethod(field406541)) {
$ans528529 = field406541.full_meth(obj405540);
} else {
if(!(R.isFunction(field406541))) {
R.ffi.throwNonFunApp(L[20],field406541);
}
$ans528529 = field406541.app();
}
break;
case 11: var anf_method_obj162181 = $ans528529;
$step524525 = 12;
$al530531 = L[20];
var obj407542 = anf_method_obj162181;
var field408543 = R.getColonField(obj407542,"pretty");
if(R.isMethod(field408543)) {
$ans528529 = field408543.full_meth(obj407542,print_DASH_width113170);
} else {
if(!(R.isFunction(field408543))) {
R.ffi.throwNonFunApp(L[20],field408543);
}
$ans528529 = field408543.app(print_DASH_width113170);
}
break;
case 12: var anf_arg163184 = $ans528529;
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[21],each798);
}
$step524525 = 32;
$al530531 = L[21];
$ans528529 = each798.app(print2,anf_arg163184);
break;
case 13: var anf_arg164185 = G(phase121155,"result",L[22]);
$step524525 = 14;
$al530531 = L[55];
var obj409544 = JS3828;
var field410545 = R.getColonField(obj409544,"CompiledCodePrinter");
if(R.isMethod(field410545)) {
$ans528529 = field410545.full_meth(obj409544,anf_arg164185);
} else {
if(!(R.isFunction(field410545))) {
R.ffi.throwNonFunApp(L[55],field410545);
}
$ans528529 = field410545.app(anf_arg164185);
}
break;
case 14: var anf_arg165188 = $ans528529;
$al530531 = L[23];
var anf_if166274 = R.checkWrapBoolean(anf_arg165188);
if(R.isPyretTrue(anf_if166274)) {
$step524525 = 15;
} else {
$step524525 = 17;
}
break;
case 15: var anf_method_obj167189 = G(phase121155,"result",L[24]);
$step524525 = 16;
$al530531 = L[24];
var obj411546 = anf_method_obj167189;
var field412547 = R.getColonField(obj411546,"pyret-to-js-pretty");
if(R.isMethod(field412547)) {
$ans528529 = field412547.full_meth(obj411546,print_DASH_width113170);
} else {
if(!(R.isFunction(field412547))) {
R.ffi.throwNonFunApp(L[24],field412547);
}
$ans528529 = field412547.app(print_DASH_width113170);
}
break;
case 16: var anf_arg168192 = $ans528529;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[25],print2);
}
$step524525 = 32;
$al530531 = L[25];
$ans528529 = print2.app(anf_arg168192);
break;
case 17: var anf_arg169193 = G(phase121155,"result",L[26]);
$step524525 = 18;
$al530531 = L[54];
var obj413548 = CS2823;
var field414549 = R.getColonField(obj413548,"NameResolution");
if(R.isMethod(field414549)) {
$ans528529 = field414549.full_meth(obj413548,anf_arg169193);
} else {
if(!(R.isFunction(field414549))) {
R.ffi.throwNonFunApp(L[54],field414549);
}
$ans528529 = field414549.app(anf_arg169193);
}
break;
case 18: var anf_arg170196 = $ans528529;
$al530531 = L[27];
var anf_if171273 = R.checkWrapBoolean(anf_arg170196);
if(R.isPyretTrue(anf_if171273)) {
$step524525 = 19;
} else {
$step524525 = 22;
}
break;
case 19: var anf_bracket172197 = G(phase121155,"result",L[28]);
var anf_method_obj173198 = G(anf_bracket172197,"ast",L[28]);
$step524525 = 20;
$al530531 = L[28];
var obj415550 = anf_method_obj173198;
var field416551 = R.getColonField(obj415550,"tosource");
if(R.isMethod(field416551)) {
$ans528529 = field416551.full_meth(obj415550);
} else {
if(!(R.isFunction(field416551))) {
R.ffi.throwNonFunApp(L[28],field416551);
}
$ans528529 = field416551.app();
}
break;
case 20: var anf_method_obj174201 = $ans528529;
$step524525 = 21;
$al530531 = L[28];
var obj417552 = anf_method_obj174201;
var field418553 = R.getColonField(obj417552,"pretty");
if(R.isMethod(field418553)) {
$ans528529 = field418553.full_meth(obj417552,print_DASH_width113170);
} else {
if(!(R.isFunction(field418553))) {
R.ffi.throwNonFunApp(L[28],field418553);
}
$ans528529 = field418553.app(print_DASH_width113170);
}
break;
case 21: var anf_arg175204 = $ans528529;
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[29],each798);
}
$step524525 = 32;
$al530531 = L[29];
$ans528529 = each798.app(print2,anf_arg175204);
break;
case 22: var anf_arg176205 = G(phase121155,"result",L[30]);
$step524525 = 23;
$al530531 = L[53];
var obj419554 = CS2823;
var field420555 = R.getColonField(obj419554,"CompileResult");
if(R.isMethod(field420555)) {
$ans528529 = field420555.full_meth(obj419554,anf_arg176205);
} else {
if(!(R.isFunction(field420555))) {
R.ffi.throwNonFunApp(L[53],field420555);
}
$ans528529 = field420555.app(anf_arg176205);
}
break;
case 23: var anf_arg177208 = $ans528529;
$al530531 = L[31];
var anf_if178272 = R.checkWrapBoolean(anf_arg177208);
if(R.isPyretTrue(anf_if178272)) {
$step524525 = 24;
} else {
$step524525 = 29;
}
break;
case 24: var cases129209 = G(phase121155,"result",L[32]);
$step524525 = 25;
R._checkAnn(L[48],R.getDotAnn(L[48],"CS",CS2943,"CompileResult"),cases129209);
break;
case 25: var cases_dispatch445604 = {"ok":26,
"err":27};
$al530531 = L[47];
$step524525 = cases_dispatch445604[cases129209.$name] || 28;
break;
case 26: if(cases129209.$arity >= 0) {
if(1 !== cases129209.$arity) {
R.ffi.throwCasesArityErrorC(L[43],1,cases129209.$arity);
}
} else {
R.ffi.throwCasesSingletonErrorC(L[43],true);
}
$step524525 = 32;
var $temp_branch566567 = function(c122210) {
var $step568569 = 0;
var $ans570571 = D;
var $al572573 = L[33];
try {
if(R.isActivationRecord(c122210)) {
var $ar586587 = c122210;
$step568569 = $ar586587.step;
$al572573 = $ar586587.from;
$ans570571 = $ar586587.ans;
c122210 = $ar586587.args[0];
anf_arg186226 = $ar586587.vars[0];
anf_arg185225 = $ar586587.vars[1];
field440583 = $ar586587.vars[2];
obj439582 = $ar586587.vars[3];
anf_if184227 = $ar586587.vars[4];
anf_arg183222 = $ar586587.vars[5];
field438581 = $ar586587.vars[6];
obj437580 = $ar586587.vars[7];
anf_arg182219 = $ar586587.vars[8];
field436579 = $ar586587.vars[9];
obj435578 = $ar586587.vars[10];
anf_method_obj181216 = $ar586587.vars[11];
field434577 = $ar586587.vars[12];
obj433576 = $ar586587.vars[13];
anf_if180228 = $ar586587.vars[14];
anf_arg179213 = $ar586587.vars[15];
field432575 = $ar586587.vars[16];
obj431574 = $ar586587.vars[17];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step568569) {
case 0: $step568569 = 1;
$al572573 = L[33];
var obj431574 = A2411;
var field432575 = R.getColonField(obj431574,"Program");
if(R.isMethod(field432575)) {
$ans570571 = field432575.full_meth(obj431574,c122210);
} else {
if(!(R.isFunction(field432575))) {
R.ffi.throwNonFunApp(L[33],field432575);
}
$ans570571 = field432575.app(c122210);
}
break;
case 1: var anf_arg179213 = $ans570571;
$al572573 = L[33];
var anf_if180228 = R.checkWrapBoolean(anf_arg179213);
if(R.isPyretTrue(anf_if180228)) {
$step568569 = 2;
} else {
$step568569 = 5;
}
break;
case 2: $step568569 = 3;
$al572573 = L[35];
var obj433576 = c122210;
var field434577 = R.getColonField(obj433576,"tosource");
if(R.isMethod(field434577)) {
$ans570571 = field434577.full_meth(obj433576);
} else {
if(!(R.isFunction(field434577))) {
R.ffi.throwNonFunApp(L[35],field434577);
}
$ans570571 = field434577.app();
}
break;
case 3: var anf_method_obj181216 = $ans570571;
$step568569 = 4;
$al572573 = L[35];
var obj435578 = anf_method_obj181216;
var field436579 = R.getColonField(obj435578,"pretty");
if(R.isMethod(field436579)) {
$ans570571 = field436579.full_meth(obj435578,print_DASH_width113170);
} else {
if(!(R.isFunction(field436579))) {
R.ffi.throwNonFunApp(L[35],field436579);
}
$ans570571 = field436579.app(print_DASH_width113170);
}
break;
case 4: var anf_arg182219 = $ans570571;
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[34],each798);
}
$step568569 = 12;
$al572573 = L[34];
$ans570571 = each798.app(print2,anf_arg182219);
break;
case 5: $step568569 = 6;
$al572573 = L[42];
var obj437580 = JS3828;
var field438581 = R.getColonField(obj437580,"CompiledCodePrinter");
if(R.isMethod(field438581)) {
$ans570571 = field438581.full_meth(obj437580,c122210);
} else {
if(!(R.isFunction(field438581))) {
R.ffi.throwNonFunApp(L[42],field438581);
}
$ans570571 = field438581.app(c122210);
}
break;
case 6: var anf_arg183222 = $ans570571;
$al572573 = L[36];
var anf_if184227 = R.checkWrapBoolean(anf_arg183222);
if(R.isPyretTrue(anf_if184227)) {
$step568569 = 7;
} else {
$step568569 = 9;
}
break;
case 7: $step568569 = 8;
$al572573 = L[38];
var obj439582 = c122210;
var field440583 = R.getColonField(obj439582,"pyret-to-js-pretty");
if(R.isMethod(field440583)) {
$ans570571 = field440583.full_meth(obj439582,print_DASH_width113170);
} else {
if(!(R.isFunction(field440583))) {
R.ffi.throwNonFunApp(L[38],field440583);
}
$ans570571 = field440583.app(print_DASH_width113170);
}
break;
case 8: var anf_arg185225 = $ans570571;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[37],print2);
}
$step568569 = 12;
$al572573 = L[37];
$ans570571 = print2.app(anf_arg185225);
break;
case 9: if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[41],print2);
}
$step568569 = 10;
$al572573 = L[41];
$ans570571 = print2.app(("Unknown CompileResult result type"));
break;
case 10: if(!(R.isFunction(torepr3))) {
R.ffi.throwNonFunApp(L[40],torepr3);
}
$step568569 = 11;
$al572573 = L[40];
$ans570571 = torepr3.app(c122210);
break;
case 11: var anf_arg186226 = $ans570571;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[39],print2);
}
$step568569 = 12;
$al572573 = L[39];
$ans570571 = print2.app(anf_arg186226);
break;
case 12: ++R.GAS;
return $ans570571;
default: throw "No case numbered " + $step568569 + " in $temp_branch566567";
}
}
} catch($e584585) {
if(R.isCont($e584585) && ($step568569 !== 12)) {
$e584585.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al572573,$temp_branch566567,$step568569,[c122210],[anf_arg186226,anf_arg185225,field440583,obj439582,anf_if184227,anf_arg183222,field438581,obj437580,anf_arg182219,field436579,obj435578,anf_method_obj181216,field434577,obj433576,anf_if180228,anf_arg179213,field432575,obj431574]);
}
if(R.isPyretException($e584585)) {
$e584585.pyretStack.push($al572573);
}
throw $e584585;
}
};
$ans528529 = cases129209.$app_fields($temp_branch566567,[false]);
break;
case 27: if(cases129209.$arity >= 0) {
if(1 !== cases129209.$arity) {
R.ffi.throwCasesArityErrorC(L[46],1,cases129209.$arity);
}
} else {
R.ffi.throwCasesSingletonErrorC(L[46],true);
}
$step524525 = 32;
var $temp_branch590591 = function(problems123251) {
var $step592593 = 0;
var $ans594595 = D;
var $al596597 = L[45];
try {
if(R.isActivationRecord(problems123251)) {
var $ar602603 = problems123251;
$step592593 = $ar602603.step;
$al596597 = $ar602603.from;
$ans594595 = $ar602603.ans;
problems123251 = $ar602603.args[0];
anf_arg187254 = $ar602603.vars[0];
field444599 = $ar602603.vars[1];
obj443598 = $ar602603.vars[2];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step592593) {
case 0: $step592593 = 1;
$al596597 = L[45];
var obj443598 = problems123251;
var field444599 = R.getColonField(obj443598,"map");
if(R.isMethod(field444599)) {
$ans594595 = field444599.full_meth(obj443598,tostring4);
} else {
if(!(R.isFunction(field444599))) {
R.ffi.throwNonFunApp(L[45],field444599);
}
$ans594595 = field444599.app(tostring4);
}
break;
case 1: var anf_arg187254 = $ans594595;
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[44],each798);
}
$step592593 = 2;
$al596597 = L[44];
$ans594595 = each798.app(print2,anf_arg187254);
break;
case 2: ++R.GAS;
return $ans594595;
default: throw "No case numbered " + $step592593 + " in $temp_branch590591";
}
}
} catch($e600601) {
if(R.isCont($e600601) && ($step592593 !== 2)) {
$e600601.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al596597,$temp_branch590591,$step592593,[problems123251],[anf_arg187254,field444599,obj443598]);
}
if(R.isPyretException($e600601)) {
$e600601.pyretStack.push($al596597);
}
throw $e600601;
}
};
$ans528529 = cases129209.$app_fields($temp_branch590591,[false]);
break;
case 28: $step524525 = 32;
$al530531 = L[47];
$ans528529 = R.throwNoCasesMatched(L[47],cases129209);
break;
case 29: if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[52],print2);
}
$step524525 = 30;
$al530531 = L[52];
$ans528529 = print2.app(("Unknown phase result type"));
break;
case 30: var anf_arg188270 = G(phase121155,"result",L[49]);
if(!(R.isFunction(torepr3))) {
R.ffi.throwNonFunApp(L[51],torepr3);
}
$step524525 = 31;
$al530531 = L[51];
$ans528529 = torepr3.app(anf_arg188270);
break;
case 31: var anf_arg189271 = $ans528529;
if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[50],print2);
}
$step524525 = 32;
$al530531 = L[50];
$ans528529 = print2.app(anf_arg189271);
break;
case 32: ++R.GAS;
return $ans528529;
default: throw "No case numbered " + $step524525 + " in $temp_lam526527";
}
}
} catch($e605606) {
if(R.isCont($e605606) && ($step524525 !== 32)) {
$e605606.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al530531,$temp_lam526527,$step524525,[phase121155],[anf_arg189271,anf_arg188270,$temp_branch590591,$temp_branch566567,cases_dispatch445604,cases129209,anf_if178272,anf_arg177208,field420555,obj419554,anf_arg176205,anf_arg175204,field418553,obj417552,anf_method_obj174201,field416551,obj415550,anf_method_obj173198,anf_bracket172197,anf_if171273,anf_arg170196,field414549,obj413548,anf_arg169193,anf_arg168192,field412547,obj411546,anf_method_obj167189,anf_if166274,anf_arg165188,field410545,obj409544,anf_arg164185,anf_arg163184,field408543,obj407542,anf_method_obj162181,field406541,obj405540,anf_method_obj161178,anf_if160275,anf_arg159177,field404539,obj403538,anf_arg158174,anf_arg157173,field402537,obj401536,anf_method_obj156169,field400535,obj399534,anf_method_obj155166,anf_if154276,anf_arg153165,field398533,obj397532,anf_arg152162,anf_arg151161,anf_arg150160]);
}
if(R.isPyretException($e605606)) {
$e605606.pyretStack.push($al530531);
}
throw $e605606;
}
};
var anf_arg190281 = R.makeFunction($temp_lam526527);
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[59],each798);
}
$step512513 = 7;
$al516517 = L[59];
$ans514515 = each798.app(anf_arg190281,comp120282);
break;
case 7: ++R.GAS;
return $ans514515;
default: throw "No case numbered " + $step512513 + " in $temp_branch510511";
}
}
} catch($e609610) {
if(R.isCont($e609610) && ($step512513 !== 7)) {
$e609610.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al516517,$temp_branch510511,$step512513,[file117135,$underscore118382],[anf_arg190281,$temp_lam526527,comp120282,field396523,obj395522,anf_method_obj149148,field394521,obj393520,anf_arg148145,anf_arg147143,anf_arg146141,file_DASH_contents119142,field392519,obj391518,anf_arg145136]);
}
if(R.isPyretException($e609610)) {
$e609610.pyretStack.push($al516517);
}
throw $e609610;
}
};
$ans393394 = cases128120.$app_fields($temp_branch510511,[false,false]);
break;
case 12: $step391392 = 13;
$al395396 = L[66];
$ans393394 = R.throwNoCasesMatched(L[66],cases128120);
break;
case 13: ++R.GAS;
return $ans393394;
default: throw "No case numbered " + $step391392 + " in $temp_branch389390";
}
}
} catch($e614615) {
if(R.isCont($e614615) && ($step391392 !== 13)) {
$e614615.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al395396,$temp_branch389390,$step391392,[opts111109,rest112119],[$temp_branch510511,$temp_branch405406,cases_dispatch446613,cases128120,type_DASH_check116140,field335404,obj334403,check_DASH_mode115139,field333402,obj332401,libs114144,anf_if144388,anf_arg143114,field331400,obj330399,print_DASH_width113170,field329398,obj328397]);
}
if(R.isPyretException($e614615)) {
$e614615.pyretStack.push($al395396);
}
throw $e614615;
}
};
$ans7879 = cases127108.$app_fields($temp_branch389390,[false,false]);
break;
case 10: if(cases127108.$arity >= 0) {
if(2 !== cases127108.$arity) {
R.ffi.throwCasesArityErrorC(L[78],2,cases127108.$arity);
}
} else {
R.ffi.throwCasesSingletonErrorC(L[78],true);
}
$step7172 = 12;
var $temp_branch624625 = function(m124618,$underscore125634) {
var $step626627 = 0;
var $ans628629 = D;
var $al630631 = L[75];
try {
if(R.isActivationRecord(m124618)) {
var $ar637638 = m124618;
$step626627 = $ar637638.step;
$al630631 = $ar637638.from;
$ans628629 = $ar637638.ans;
m124618 = $ar637638.args[0];
$underscore125634 = $ar637638.args[1];
anf_arg192623 = $ar637638.vars[0];
anf_arg191622 = $ar637638.vars[1];
field450633 = $ar637638.vars[2];
obj449632 = $ar637638.vars[3];
arg_126621 = $ar637638.vars[4];
}
if(--R.GAS <= 0) {
R.EXN_STACKHEIGHT = 0;
throw R.makeCont();
}
while(true) {
switch($step626627) {
case 0: if(!(R.isFunction(_plus1))) {
R.ffi.throwNonFunApp(L[77],_plus1);
}
$step626627 = 1;
$al630631 = L[77];
$ans628629 = _plus1.app(("Error: "),m124618);
break;
case 1: var arg_126621 = $ans628629;
$step626627 = 2;
$al630631 = L[76];
var obj449632 = C1412;
var field450633 = R.getColonField(obj449632,"usage-info");
if(R.isMethod(field450633)) {
$ans628629 = field450633.full_meth(obj449632,options109104);
} else {
if(!(R.isFunction(field450633))) {
R.ffi.throwNonFunApp(L[76],field450633);
}
$ans628629 = field450633.app(options109104);
}
break;
case 2: var anf_arg191622 = $ans628629;
if(!(R.isFunction(link627))) {
R.ffi.throwNonFunApp(L[75],link627);
}
$step626627 = 3;
$al630631 = L[75];
$ans628629 = link627.app(arg_126621,anf_arg191622);
break;
case 3: var anf_arg192623 = $ans628629;
if(!(R.isFunction(each798))) {
R.ffi.throwNonFunApp(L[74],each798);
}
$step626627 = 4;
$al630631 = L[74];
$ans628629 = each798.app(print2,anf_arg192623);
break;
case 4: ++R.GAS;
return $ans628629;
default: throw "No case numbered " + $step626627 + " in $temp_branch624625";
}
}
} catch($e635636) {
if(R.isCont($e635636) && ($step626627 !== 4)) {
$e635636.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al630631,$temp_branch624625,$step626627,[m124618,$underscore125634],[anf_arg192623,anf_arg191622,field450633,obj449632,arg_126621]);
}
if(R.isPyretException($e635636)) {
$e635636.pyretStack.push($al630631);
}
throw $e635636;
}
};
$ans7879 = cases127108.$app_fields($temp_branch624625,[false,false]);
break;
case 11: $step7172 = 12;
$al8081 = L[79];
$ans7879 = R.throwNoCasesMatched(L[79],cases127108);
break;
case 12: if(!(R.isFunction(print2))) {
R.ffi.throwNonFunApp(L[81],print2);
}
$step7172 = 13;
$al8081 = L[81];
$ans7879 = print2.app(("Finished"));
break;
case 13: var answer193646 = $ans7879;
var provides194645 = R.makeObject({});
$step7172 = 14;
$al8081 = L[80];
var obj452640 = builtins5;
var field453641 = R.getColonField(obj452640,"current-checker");
if(R.isMethod(field453641)) {
$ans7879 = field453641.full_meth(obj452640);
} else {
if(!(R.isFunction(field453641))) {
R.ffi.throwNonFunApp(L[80],field453641);
}
$ans7879 = field453641.app();
}
break;
case 14: var anf_method_obj195642 = $ans7879;
$step7172 = 15;
$al8081 = L[80];
var obj454643 = anf_method_obj195642;
var field455644 = R.getColonField(obj454643,"results");
if(R.isMethod(field455644)) {
$ans7879 = field455644.full_meth(obj454643);
} else {
if(!(R.isFunction(field455644))) {
R.ffi.throwNonFunApp(L[80],field455644);
}
$ans7879 = field455644.app();
}
break;
case 15: var checks196647 = $ans7879;
$step7172 = 16;
$ans7879 = R.makeObject({"answer":answer193646,
"namespace":NAMESPACE,
"defined-values":{"parsed-options":parsed_DASH_options110107,
"options":options109104,
"C":C1412,
"SD":SD1819,
"sets":sets10318,
"error":error10113,
"option":option9316,
"lists":lists5615,
"arrays":arrays4410,
"F":F4214,
"CH":CH4026,
"JS":JS3828,
"N":N3620,
"AN":AN3421,
"U":U3222,
"R":R3029,
"CS":CS2823,
"CM":CM2624,
"A":A2411,
"DC":DC2225,
"D":D2027,
"P":P1617},
"defined-types":{"C":C1532,
"CS":CS2943,
"sets":sets10438,
"error":error10233,
"option":option9436,
"lists":lists5735,
"arrays":arrays4530,
"F":F4334,
"CH":CH4146,
"JS":JS3948,
"N":N3740,
"AN":AN3541,
"U":U3342,
"R":R3149,
"CM":CM2744,
"A":A2531,
"DC":DC2345,
"D":D2147,
"SD":SD1939,
"P":P1737},
"provide-plus-types":R.makeObject({"values":provides194645,
"types":{}}),
"checks":checks196647});
break;
case 16: ++R.GAS;
return $ans7879;
default: throw "No case numbered " + $step7172 + " in $toplevel7374";
}
}
} catch($e649650) {
if(R.isCont($e649650) && ($step7172 !== 16)) {
$e649650.stack[R.EXN_STACKHEIGHT++] = R.makeActivationRecord($al8081,$toplevel7374,$step7172,[$resumer77648],[checks196647,field455644,obj454643,anf_method_obj195642,field453641,obj452640,provides194645,answer193646,$temp_branch624625,$temp_branch389390,cases_dispatch451639,cases127108,parsed_DASH_options110107,field208106,obj207105,options109104,field206103,obj205102,anf_arg142101,anf_array_val14199,field20495,obj20394,anf_arg14093,anf_array_val13998,field20292,obj20191,anf_arg13890,anf_array_val13797,field20089,obj19988,anf_arg13687,anf_array_val13596,field19886,obj19785,anf_arg13484,anf_arg13383,anf_arg13282,anf_method_obj131100]);
}
if(R.isPyretException($e649650)) {
$e649650.pyretStack.push($al8081);
}
throw $e649650;
}
};
return R.safeCall($toplevel7374,function(moduleVal) {
R.modules["$file://.//src/scripts/show-compilation.arr50"] = moduleVal;
return moduleVal;
},"Evaluating $toplevel7374");
});
})