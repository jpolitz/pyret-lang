// tree-sitter-pyret grammar.
//
// Faithful translation of lang/src/js/base/pyret-grammar.bnf. ALL terminals are
// external tokens emitted by src/scanner.c (a port of pyret-tokenizer.js); the
// internal lexer is bypassed (extras: []). Rule names mirror BNF nonterminals
// with '-' -> '_'. External token ids mirror tokenizer token NAMEs (see
// token-map.json). The order of `externals` below MUST match the TokenType enum
// in src/scanner.c exactly.
//
// tree-sitter forbids nullable non-start rules, so BNF rules that can match the
// empty string (block, ty_params, return_ann, doc_string, where_clause, ...) are
// defined here as their non-empty content and wrapped in optional() at use sites.
// `prelude` is inlined into the `program` start rule.

module.exports = grammar({
  name: 'pyret',

  externals: $ => [
    // parens (index 0..2)
    $.parenspace, $.parennospace, $.parenafterbrace,
    // literals (3..7)
    $.name, $.number, $.rational, $.roughrational, $.string,
    // bracket/brace/punct (8..26)
    $.rparen, $.lbrack, $.rbrack, $.lbrace, $.rbrace,
    $.semi, $.backslash, $.dotdotdot, $.dot, $.bang, $.percent,
    $.comma, $.thinarrow, $.thickarrow, $.colonequals, $.coloncolon, $.colon,
    $.bar, $.equals,
    // angle/operators (27..42)
    $.langle, $.rangle, $.star,
    $.op_caret, $.op_plus, $.op_dash, $.op_times, $.op_slash, $.op_spaceship,
    $.op_leq, $.op_geq, $.op_equalequal, $.op_equaltilde, $.op_neq,
    $.op_lt, $.op_gt,
    // keywords (43..113)
    $.and_kw, $.as_kw, $.ascending_kw, $.ask_kw, $.by_kw, $.cases_kw, $.check_kw,
    $.data_kw, $.descending_kw, $.do_kw, $.raisesnot_kw, $.else_kw, $.elseif_kw,
    $.end_kw, $.examples_kw, $.table_extend_kw, $.table_extract_kw, $.false_kw,
    $.for_kw, $.from_kw, $.fun_kw, $.hiding_kw, $.if_kw, $.import_kw, $.include_kw,
    $.is_kw, $.isequalequal_kw, $.isequaltilde_kw, $.isnot_kw, $.isnotequalequal_kw,
    $.isnotequaltilde_kw, $.isnotspaceship_kw, $.isroughly_kw, $.isnotroughly_kw,
    $.isspaceship_kw, $.because_kw, $.lam_kw, $.lazy_kw, $.let_kw, $.letrec_kw,
    $.loadtable_kw, $.method_kw, $.module_kw, $.newtype_kw, $.of_kw, $.or_kw,
    $.provide_kw, $.providetypes_kw, $.raises_kw, $.raisesother_kw,
    $.raisessatisfies_kw, $.raisesviolates_kw, $.reactor_kw, $.rec_kw, $.ref_kw,
    $.sanitize_kw, $.satisfies_kw, $.table_select_kw, $.shadow_kw, $.table_filter_kw,
    $.spy_kw, $.table_order_kw, $.table_update_kw, $.true_kw, $.type_kw, $.typelet_kw,
    $.using_kw, $.use_kw, $.var_kw, $.satisfiesnot_kw, $.when_kw,
    // colon-keywords / symbol-words (114..127)
    $.block_kw, $.checkcolon, $.doc_kw, $.elsecolon, $.examplescolon,
    $.otherwisecolon, $.providecolon, $.row_kw, $.sharing_kw, $.sourcecolon,
    $.table_kw, $.thencolon, $.where_kw, $.with_kw,
    // error tokens (128..132)
    $.unterminated_string, $.unterminated_block_comment, $.bad_oper, $.bad_number,
    $.unknown,
    // '[' as bracket access (a[i]); distinct from list/construct '[' (lbrack). MUST be
    // last to match the scanner enum's LBRACK_ACCESS position. (133)
    $.lbrack_access,
  ],

  extras: $ => [],

  conflicts: $ => [
    [$.binop_expr, $.app_expr],
    [$.name_ann, $.id_expr],
    [$.let_expr, $.toplevel_binding],
    [$.obj_expr, $.tuple_expr],
    [$.record_ann, $.tuple_ann],
    [$.data_name_spec, $.name_spec],
    [$.name_binding, $.id_expr],
    [$.comma_ann_field],
    [$.obj_fields],
    [$.fields],
    [$.comma_binops],
    [$.tuple_fields],
    [$.comma_anns],
    [$.comma_names],
  ],

  rules: {
    // program: prelude block   (prelude inlined; both prelude and block nullable)
    program: $ => seq(
      optional($.use_stmt),
      repeat(choice($.provide_stmt, $.import_stmt)),
      optional($.block),
    ),

    use_stmt: $ => seq($.use_kw, $.name, $.import_source),

    import_stmt: $ => choice(
      seq($.include_kw, $.import_source),
      seq($.include_kw, $.from_kw, $.module_ref, $.colon, optional(seq($.include_spec, repeat(seq($.comma, $.include_spec)), optional($.comma))), $.end_kw),
      seq($.import_kw, $.import_source, $.as_kw, $.name),
      seq($.import_kw, $.comma_names, $.from_kw, $.import_source),
    ),
    import_source: $ => choice($.import_special, $.import_name),
    import_special: $ => seq($.name, $.parennospace, $.string, repeat(seq($.comma, $.string)), $.rparen),
    import_name: $ => $.name,

    include_spec: $ => choice($.include_name_spec, $.include_type_spec, $.include_data_spec, $.include_module_spec),
    include_name_spec: $ => $.name_spec,
    include_type_spec: $ => seq($.type_kw, $.name_spec),
    include_data_spec: $ => seq($.data_kw, $.data_name_spec, optional($.hiding_spec)),
    include_module_spec: $ => seq($.module_kw, $.name_spec),

    provide_stmt: $ => choice($.provide_vals_stmt, $.provide_types_stmt, $.provide_block),
    provide_vals_stmt: $ => choice(seq($.provide_kw, $.stmt, $.end_kw), seq($.provide_kw, choice($.star, $.op_times))),
    provide_types_stmt: $ => choice(seq($.providetypes_kw, $.record_ann), seq($.providetypes_kw, choice($.star, $.op_times))),

    provide_block: $ => choice(
      seq($.providecolon, optional(seq($.provide_spec, repeat(seq($.comma, $.provide_spec)), optional($.comma))), $.end_kw),
      seq($.provide_kw, $.from_kw, $.module_ref, $.colon, optional(seq($.provide_spec, repeat(seq($.comma, $.provide_spec)), optional($.comma))), $.end_kw),
    ),

    provide_spec: $ => choice($.provide_name_spec, $.provide_type_spec, $.provide_data_spec, $.provide_module_spec),
    name_spec: $ => choice(seq(choice($.star, $.op_times), optional($.hiding_spec)), $.module_ref, seq($.module_ref, $.as_kw, $.name)),
    data_name_spec: $ => choice(choice($.star, $.op_times), $.module_ref),
    provide_name_spec: $ => $.name_spec,
    provide_type_spec: $ => seq($.type_kw, $.name_spec),
    provide_data_spec: $ => seq($.data_kw, $.data_name_spec, optional($.hiding_spec)),
    provide_module_spec: $ => seq($.module_kw, $.name_spec),

    hiding_spec: $ => seq($.hiding_kw, choice($.parenspace, $.parennospace), optional(seq(repeat(seq($.name, $.comma)), $.name)), $.rparen),

    module_ref: $ => seq(repeat(seq($.name, $.dot)), $.name),

    comma_names: $ => seq($.name, repeat(seq($.comma, $.name))),

    block: $ => repeat1($.stmt),

    stmt: $ => choice(
      $.type_expr, $.newtype_expr, $.spy_stmt,
      $.let_expr, $.fun_expr, $.data_expr, $.when_expr,
      $.var_expr, $.rec_expr, $.assign_expr, $.check_test, $.check_expr,
      $.contract_stmt,
    ),

    spy_stmt: $ => seq($.spy_kw, optional($.binop_expr), $.colon, optional($.spy_contents), $.end_kw),
    spy_contents: $ => seq($.spy_field, repeat(seq($.comma, $.spy_field))),
    spy_field: $ => choice($.id_expr, seq($.name, $.colon, $.binop_expr)),

    type_expr: $ => seq($.type_kw, $.name, optional($.ty_params), $.equals, $.ann),
    newtype_expr: $ => seq($.newtype_kw, $.name, $.as_kw, $.name),
    let_expr: $ => seq($.toplevel_binding, $.equals, $.binop_expr),
    binding: $ => choice($.name_binding, $.tuple_binding),

    tuple_binding: $ => seq($.lbrace, repeat(seq($.binding, $.semi)), $.binding, optional($.semi), $.rbrace, optional(seq($.as_kw, $.name_binding))),
    name_binding: $ => seq(optional($.shadow_kw), $.name, optional(seq($.coloncolon, $.ann))),

    toplevel_binding: $ => $.binding,
    multi_let_expr: $ => seq($.let_kw, $.let_binding, repeat(seq($.comma, $.let_binding)), choice($.block_kw, $.colon), optional($.block), $.end_kw),
    let_binding: $ => choice($.let_expr, $.var_expr),
    letrec_expr: $ => seq($.letrec_kw, $.let_expr, repeat(seq($.comma, $.let_expr)), choice($.block_kw, $.colon), optional($.block), $.end_kw),

    type_bind: $ => seq($.name, optional($.ty_params), $.equals, $.ann),
    newtype_bind: $ => seq($.newtype_kw, $.name, $.as_kw, $.name),
    type_let_bind: $ => choice($.type_bind, $.newtype_bind),
    type_let_expr: $ => seq($.typelet_kw, $.type_let_bind, repeat(seq($.comma, $.type_let_bind)), choice($.block_kw, $.colon), optional($.block), $.end_kw),

    contract_stmt: $ => seq($.name, $.coloncolon, optional($.ty_params), choice($.ann, $.noparen_arrow_ann)),

    fun_expr: $ => seq($.fun_kw, $.name, $.fun_header, choice($.block_kw, $.colon), optional($.doc_string), optional($.block), optional($.where_clause), $.end_kw),
    fun_header: $ => choice(seq(optional($.ty_params), $.args, optional($.return_ann)), seq(optional($.ty_params), $.bad_args, optional($.return_ann))),
    ty_params: $ => seq(choice($.langle, $.op_lt), $.comma_names, choice($.rangle, $.op_gt)),
    args: $ => seq(choice($.parennospace, $.parenafterbrace), optional(seq($.binding, repeat(seq($.comma, $.binding)))), $.rparen),
    bad_args: $ => seq($.parenspace, optional(seq($.binding, repeat(seq($.comma, $.binding)))), $.rparen),
    return_ann: $ => seq($.thinarrow, $.ann),
    doc_string: $ => seq($.doc_kw, $.string),
    where_clause: $ => seq($.where_kw, optional($.block)),

    check_expr: $ => choice(
      seq(choice($.check_kw, $.examples_kw), $.string, $.colon, optional($.block), $.end_kw),
      seq(choice($.checkcolon, $.examplescolon), optional($.block), $.end_kw),
    ),
    check_test: $ => choice(
      seq($.binop_expr, $.check_op, optional(seq($.percent, choice($.parenspace, $.parennospace), $.binop_expr, $.rparen)), $.binop_expr, optional(seq($.because_kw, $.binop_expr))),
      seq($.binop_expr, $.check_op_postfix, optional(seq($.because_kw, $.binop_expr))),
      $.binop_expr,
    ),

    data_expr: $ => seq($.data_kw, $.name, optional($.ty_params), $.colon, optional($.first_data_variant), repeat($.data_variant), optional($.data_sharing), optional($.where_clause), $.end_kw),
    variant_constructor: $ => seq($.name, $.variant_members),
    first_data_variant: $ => choice(seq($.variant_constructor, optional($.data_with)), seq($.name, optional($.data_with))),
    data_variant: $ => choice(seq($.bar, $.variant_constructor, optional($.data_with)), seq($.bar, $.name, optional($.data_with))),
    variant_members: $ => seq($.parennospace, optional(seq($.variant_member, repeat(seq($.comma, $.variant_member)))), $.rparen),
    variant_member: $ => seq(optional($.ref_kw), $.binding),
    data_with: $ => seq($.with_kw, $.fields),
    data_sharing: $ => seq($.sharing_kw, $.fields),

    var_expr: $ => seq($.var_kw, $.toplevel_binding, $.equals, $.binop_expr),
    rec_expr: $ => seq($.rec_kw, $.toplevel_binding, $.equals, $.binop_expr),
    assign_expr: $ => seq($.name, $.colonequals, $.binop_expr),

    when_expr: $ => seq($.when_kw, $.binop_expr, choice($.block_kw, $.colon), optional($.block), $.end_kw),

    binop_expr: $ => prec.left(seq($.expr, repeat(seq($.binop, $.expr)))),
    binop: $ => choice($.op_plus, $.op_dash, $.op_times, $.op_slash, $.op_leq, $.op_geq, $.op_equalequal, $.op_spaceship, $.op_equaltilde, $.op_neq, $.op_lt, $.op_gt, $.and_kw, $.or_kw, $.op_caret),

    check_op: $ => choice($.is_kw, $.isequalequal_kw, $.isequaltilde_kw, $.isspaceship_kw, $.isroughly_kw, $.isnotroughly_kw, $.isnot_kw, $.isnotequalequal_kw, $.isnotequaltilde_kw, $.isnotspaceship_kw, $.raises_kw, $.raisesother_kw, $.satisfies_kw, $.satisfiesnot_kw, $.raisessatisfies_kw, $.raisesviolates_kw),
    check_op_postfix: $ => $.raisesnot_kw,

    expr: $ => choice(
      $.paren_expr, $.id_expr, $.prim_expr,
      $.lambda_expr, $.method_expr, $.app_expr,
      $.obj_expr, $.tuple_expr, $.tuple_get,
      $.dot_expr,
      $.template_expr,
      $.bracket_expr,
      $.get_bang_expr, $.update_expr,
      $.extend_expr,
      $.if_expr, $.if_pipe_expr, $.cases_expr,
      $.for_expr,
      $.user_block_expr, $.inst_expr,
      $.multi_let_expr, $.letrec_expr,
      $.type_let_expr,
      $.construct_expr,
      $.table_select, $.table_extend, $.table_filter, $.table_order, $.table_extract, $.table_update,
      $.table_expr, $.load_table_expr, $.reactor_expr,
    ),

    template_expr: $ => $.dotdotdot,

    paren_expr: $ => seq(choice($.parenspace, $.parenafterbrace), $.binop_expr, $.rparen),

    id_expr: $ => $.name,

    prim_expr: $ => choice($.num_expr, $.frac_expr, $.rfrac_expr, $.bool_expr, $.string_expr),
    num_expr: $ => $.number,
    frac_expr: $ => $.rational,
    rfrac_expr: $ => $.roughrational,
    bool_expr: $ => choice($.true_kw, $.false_kw),
    string_expr: $ => $.string,

    lambda_expr: $ => choice(
      seq($.lam_kw, $.fun_header, choice($.block_kw, $.colon), optional($.doc_string), optional($.block), optional($.where_clause), $.end_kw),
      seq($.lbrace, $.fun_header, choice($.block_kw, $.colon), optional($.doc_string), optional($.block), optional($.where_clause), $.rbrace),
    ),
    method_expr: $ => seq($.method_kw, $.fun_header, choice($.block_kw, $.colon), optional($.doc_string), optional($.block), optional($.where_clause), $.end_kw),

    // NOTE: the BNF has two extra "rigged" productions
    //   expr PARENSPACE RPAREN | expr PARENSPACE binop COMMA binop... RPAREN
    // that exist ONLY so the reference can emit a parse error for `f ()` / `f (a,b)`
    // (space before args). Including them here makes the parser greedily shift a
    // PARENSPACE `(` after any expr, which breaks the legitimate parse of a statement
    // that simply ENDS and is followed by a parenthesized-expression statement
    // (e.g. `x = 1 \n (y > 0)`). We omit them: `f ()`/`f (a,b)` then fail to parse
    // (ERROR node) just as the reference errors on them — both-error = matching behavior.
    app_expr: $ => prec.left(20, seq($.expr, $.app_args)),
    app_args: $ => seq($.parennospace, optional($.comma_binops), $.rparen),
    comma_binops: $ => seq($.binop_expr, repeat(seq($.comma, $.binop_expr))),

    inst_expr: $ => prec.left(20, seq($.expr, $.langle, $.ann, repeat(seq($.comma, $.ann)), choice($.rangle, $.op_gt))),

    tuple_expr: $ => seq($.lbrace, $.tuple_fields, $.rbrace),
    tuple_fields: $ => seq($.binop_expr, repeat(seq($.semi, $.binop_expr)), optional($.semi)),

    tuple_get: $ => prec.left(20, seq($.expr, $.dot, $.lbrace, $.number, $.rbrace)),

    obj_expr: $ => choice(seq($.lbrace, $.obj_fields, $.rbrace), seq($.lbrace, $.rbrace)),
    obj_fields: $ => seq($.obj_field, repeat(seq($.comma, $.obj_field)), optional($.comma)),
    obj_field: $ => choice(
      seq($.key, $.colon, $.binop_expr),
      seq($.ref_kw, $.key, optional(seq($.coloncolon, $.ann)), $.colon, $.binop_expr),
      seq($.method_kw, $.key, $.fun_header, choice($.block_kw, $.colon), optional($.doc_string), optional($.block), optional($.where_clause), $.end_kw),
    ),

    fields: $ => seq($.field, repeat(seq($.comma, $.field)), optional($.comma)),
    field: $ => choice(
      seq($.key, $.colon, $.binop_expr),
      seq($.method_kw, $.key, $.fun_header, choice($.block_kw, $.colon), optional($.doc_string), optional($.block), optional($.where_clause), $.end_kw),
    ),
    key: $ => $.name,

    construct_expr: $ => seq($.lbrack, optional($.construct_modifier), $.binop_expr, $.colon, optional(seq($.comma_binops, optional($.comma))), $.rbrack),
    construct_modifier: $ => $.lazy_kw,

    table_expr: $ => seq($.table_kw, optional($.table_headers), optional($.table_rows), $.end_kw),
    table_headers: $ => seq(repeat($.list_table_header), $.table_header),
    list_table_header: $ => seq($.table_header, $.comma),
    table_header: $ => seq($.name, optional(seq($.coloncolon, $.ann))),
    table_rows: $ => repeat1($.table_row),
    table_row: $ => seq($.row_kw, optional($.table_items)),
    table_items: $ => seq(repeat($.list_table_item), $.binop_expr),
    list_table_item: $ => seq($.binop_expr, $.comma),

    reactor_expr: $ => seq($.reactor_kw, $.colon, $.fields, $.end_kw),

    dot_expr: $ => prec.left(20, seq($.expr, $.dot, $.name)),
    bracket_expr: $ => prec.left(20, seq($.expr, $.lbrack_access, $.binop_expr, $.rbrack)),

    get_bang_expr: $ => prec.left(20, seq($.expr, $.bang, $.name)),

    extend_expr: $ => prec.left(20, seq($.expr, $.dot, $.lbrace, $.fields, $.rbrace)),
    update_expr: $ => prec.left(20, seq($.expr, $.bang, $.lbrace, $.fields, $.rbrace)),

    if_expr: $ => seq($.if_kw, $.binop_expr, choice($.block_kw, $.colon), optional($.block), repeat($.else_if), optional(seq($.elsecolon, optional($.block))), $.end_kw),
    else_if: $ => seq($.elseif_kw, $.binop_expr, $.colon, optional($.block)),
    if_pipe_expr: $ => seq($.ask_kw, choice($.block_kw, $.colon), repeat($.if_pipe_branch), optional(seq($.bar, $.otherwisecolon, optional($.block))), $.end_kw),
    if_pipe_branch: $ => seq($.bar, $.binop_expr, $.thencolon, optional($.block)),

    cases_binding: $ => seq(optional($.ref_kw), $.binding),
    cases_args: $ => seq($.parennospace, optional(seq($.cases_binding, repeat(seq($.comma, $.cases_binding)))), $.rparen),
    cases_expr: $ => seq($.cases_kw, choice($.parenspace, $.parennospace), $.ann, $.rparen, $.binop_expr, choice($.block_kw, $.colon), repeat($.cases_branch), optional(seq($.bar, $.else_kw, $.thickarrow, optional($.block))), $.end_kw),
    cases_branch: $ => seq($.bar, $.name, optional($.cases_args), $.thickarrow, optional($.block)),

    for_bind: $ => seq($.binding, $.from_kw, $.binop_expr),
    for_expr: $ => seq($.for_kw, $.expr, $.parennospace, optional(seq($.for_bind, repeat(seq($.comma, $.for_bind)))), $.rparen, optional($.return_ann), choice($.block_kw, $.colon), optional($.block), $.end_kw),

    column_order: $ => seq($.name, choice($.ascending_kw, $.descending_kw)),
    table_select: $ => seq($.table_select_kw, $.name, repeat(seq($.comma, $.name)), $.from_kw, $.expr, $.end_kw),
    table_filter: $ => seq($.table_filter_kw, $.expr, optional(seq($.using_kw, $.binding, repeat(seq($.comma, $.binding)))), $.colon, $.binop_expr, $.end_kw),
    table_order: $ => seq($.table_order_kw, $.expr, $.colon, $.column_order, repeat(seq($.comma, $.column_order)), $.end_kw),
    table_extract: $ => seq($.table_extract_kw, $.name, $.from_kw, $.expr, $.end_kw),
    table_update: $ => seq($.table_update_kw, $.expr, optional(seq($.using_kw, $.binding, repeat(seq($.comma, $.binding)))), $.colon, $.obj_fields, $.end_kw),
    table_extend: $ => seq($.table_extend_kw, $.expr, optional(seq($.using_kw, $.binding, repeat(seq($.comma, $.binding)))), $.colon, $.table_extend_fields, $.end_kw),
    table_extend_fields: $ => seq(repeat($.list_table_extend_field), $.table_extend_field, optional($.comma)),
    list_table_extend_field: $ => seq($.table_extend_field, $.comma),
    table_extend_field: $ => choice(
      seq($.key, optional(seq($.coloncolon, $.ann)), $.colon, $.binop_expr),
      seq($.key, optional(seq($.coloncolon, $.ann)), $.colon, $.expr, $.of_kw, $.name),
    ),

    load_table_expr: $ => seq($.loadtable_kw, $.colon, optional($.table_headers), optional($.load_table_specs), $.end_kw),
    load_table_specs: $ => repeat1($.load_table_spec),
    load_table_spec: $ => choice(seq($.sourcecolon, $.expr), seq($.sanitize_kw, $.name, $.using_kw, $.expr)),

    user_block_expr: $ => seq($.block_kw, optional($.block), $.end_kw),

    ann: $ => choice($.name_ann, $.record_ann, $.arrow_ann, $.app_ann, $.pred_ann, $.dot_ann, $.tuple_ann),
    name_ann: $ => $.name,
    comma_ann_field: $ => seq($.ann_field, repeat(seq($.comma, $.ann_field))),
    record_ann: $ => seq($.lbrace, optional(seq($.comma_ann_field, optional($.comma))), $.rbrace),
    ann_field: $ => seq($.name, $.coloncolon, $.ann),
    tuple_ann: $ => seq($.lbrace, $.ann, repeat(seq($.semi, $.ann)), optional($.semi), $.rbrace),
    noparen_arrow_ann: $ => seq(optional($.arrow_ann_args), $.thinarrow, $.ann),
    arrow_ann_args: $ => choice($.comma_anns, seq(choice($.parenspace, $.parennospace, $.parenafterbrace), $.comma_ann_field, $.rparen)),
    arrow_ann: $ => seq(choice($.parenspace, $.parennospace, $.parenafterbrace), optional($.arrow_ann_args), $.thinarrow, $.ann, $.rparen),
    app_ann: $ => prec.left(20, seq(choice($.name_ann, $.dot_ann), $.langle, $.comma_anns, choice($.rangle, $.op_gt))),
    comma_anns: $ => seq($.ann, repeat(seq($.comma, $.ann))),
    pred_ann: $ => prec.left(20, seq($.ann, $.percent, choice($.parenspace, $.parennospace), $.id_expr, $.rparen)),
    dot_ann: $ => seq($.name, $.dot, $.name),
  },
});
