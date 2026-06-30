var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/@lezer/common/dist/index.cjs
var require_dist = __commonJS({
  "node_modules/@lezer/common/dist/index.cjs"(exports2) {
    "use strict";
    var DefaultBufferLength = 1024;
    var nextPropID = 0;
    var Range = class {
      constructor(from, to) {
        this.from = from;
        this.to = to;
      }
    };
    var NodeProp = class {
      /**
      Create a new node prop type.
      */
      constructor(config = {}) {
        this.id = nextPropID++;
        this.perNode = !!config.perNode;
        this.deserialize = config.deserialize || (() => {
          throw new Error("This node type doesn't define a deserialize function");
        });
        this.combine = config.combine || null;
      }
      /**
      This is meant to be used with
      [`NodeSet.extend`](#common.NodeSet.extend) or
      [`LRParser.configure`](#lr.ParserConfig.props) to compute
      prop values for each node type in the set. Takes a [match
      object](#common.NodeType^match) or function that returns undefined
      if the node type doesn't get this prop, and the prop's value if
      it does.
      */
      add(match) {
        if (this.perNode)
          throw new RangeError("Can't add per-node props to node types");
        if (typeof match != "function")
          match = NodeType.match(match);
        return (type) => {
          let result = match(type);
          return result === void 0 ? null : [this, result];
        };
      }
    };
    NodeProp.closedBy = new NodeProp({ deserialize: (str) => str.split(" ") });
    NodeProp.openedBy = new NodeProp({ deserialize: (str) => str.split(" ") });
    NodeProp.group = new NodeProp({ deserialize: (str) => str.split(" ") });
    NodeProp.isolate = new NodeProp({ deserialize: (value) => {
      if (value && value != "rtl" && value != "ltr" && value != "auto")
        throw new RangeError("Invalid value for isolate: " + value);
      return value || "auto";
    } });
    NodeProp.contextHash = new NodeProp({ perNode: true });
    NodeProp.lookAhead = new NodeProp({ perNode: true });
    NodeProp.mounted = new NodeProp({ perNode: true });
    var MountedTree = class {
      constructor(tree, overlay, parser2, bracketed = false) {
        this.tree = tree;
        this.overlay = overlay;
        this.parser = parser2;
        this.bracketed = bracketed;
      }
      /**
      @internal
      */
      static get(tree) {
        return tree && tree.props && tree.props[NodeProp.mounted.id];
      }
    };
    var noProps = /* @__PURE__ */ Object.create(null);
    var NodeType = class _NodeType {
      /**
      @internal
      */
      constructor(name, props, id, flags = 0) {
        this.name = name;
        this.props = props;
        this.id = id;
        this.flags = flags;
      }
      /**
      Define a node type.
      */
      static define(spec) {
        let props = spec.props && spec.props.length ? /* @__PURE__ */ Object.create(null) : noProps;
        let flags = (spec.top ? 1 : 0) | (spec.skipped ? 2 : 0) | (spec.error ? 4 : 0) | (spec.name == null ? 8 : 0);
        let type = new _NodeType(spec.name || "", props, spec.id, flags);
        if (spec.props)
          for (let src of spec.props) {
            if (!Array.isArray(src))
              src = src(type);
            if (src) {
              if (src[0].perNode)
                throw new RangeError("Can't store a per-node prop on a node type");
              props[src[0].id] = src[1];
            }
          }
        return type;
      }
      /**
      Retrieves a node prop for this type. Will return `undefined` if
      the prop isn't present on this node.
      */
      prop(prop) {
        return this.props[prop.id];
      }
      /**
      True when this is the top node of a grammar.
      */
      get isTop() {
        return (this.flags & 1) > 0;
      }
      /**
      True when this node is produced by a skip rule.
      */
      get isSkipped() {
        return (this.flags & 2) > 0;
      }
      /**
      Indicates whether this is an error node.
      */
      get isError() {
        return (this.flags & 4) > 0;
      }
      /**
      When true, this node type doesn't correspond to a user-declared
      named node, for example because it is used to cache repetition.
      */
      get isAnonymous() {
        return (this.flags & 8) > 0;
      }
      /**
      Returns true when this node's name or one of its
      [groups](#common.NodeProp^group) matches the given string.
      */
      is(name) {
        if (typeof name == "string") {
          if (this.name == name)
            return true;
          let group = this.prop(NodeProp.group);
          return group ? group.indexOf(name) > -1 : false;
        }
        return this.id == name;
      }
      /**
      Create a function from node types to arbitrary values by
      specifying an object whose property names are node or
      [group](#common.NodeProp^group) names. Often useful with
      [`NodeProp.add`](#common.NodeProp.add). You can put multiple
      names, separated by spaces, in a single property name to map
      multiple node names to a single value.
      */
      static match(map) {
        let direct = /* @__PURE__ */ Object.create(null);
        for (let prop in map)
          for (let name of prop.split(" "))
            direct[name] = map[prop];
        return (node) => {
          for (let groups = node.prop(NodeProp.group), i = -1; i < (groups ? groups.length : 0); i++) {
            let found = direct[i < 0 ? node.name : groups[i]];
            if (found)
              return found;
          }
        };
      }
    };
    NodeType.none = new NodeType(
      "",
      /* @__PURE__ */ Object.create(null),
      0,
      8
      /* NodeFlag.Anonymous */
    );
    var NodeSet = class _NodeSet {
      /**
      Create a set with the given types. The `id` property of each
      type should correspond to its position within the array.
      */
      constructor(types) {
        this.types = types;
        for (let i = 0; i < types.length; i++)
          if (types[i].id != i)
            throw new RangeError("Node type ids should correspond to array positions when creating a node set");
      }
      /**
      Create a copy of this set with some node properties added. The
      arguments to this method can be created with
      [`NodeProp.add`](#common.NodeProp.add).
      */
      extend(...props) {
        let newTypes = [];
        for (let type of this.types) {
          let newProps = null;
          for (let source of props) {
            let add = source(type);
            if (add) {
              if (!newProps)
                newProps = Object.assign({}, type.props);
              let value = add[1], prop = add[0];
              if (prop.combine && prop.id in newProps)
                value = prop.combine(newProps[prop.id], value);
              newProps[prop.id] = value;
            }
          }
          newTypes.push(newProps ? new NodeType(type.name, newProps, type.id, type.flags) : type);
        }
        return new _NodeSet(newTypes);
      }
    };
    var CachedNode = /* @__PURE__ */ new WeakMap();
    var CachedInnerNode = /* @__PURE__ */ new WeakMap();
    exports2.IterMode = void 0;
    (function(IterMode) {
      IterMode[IterMode["ExcludeBuffers"] = 1] = "ExcludeBuffers";
      IterMode[IterMode["IncludeAnonymous"] = 2] = "IncludeAnonymous";
      IterMode[IterMode["IgnoreMounts"] = 4] = "IgnoreMounts";
      IterMode[IterMode["IgnoreOverlays"] = 8] = "IgnoreOverlays";
      IterMode[IterMode["EnterBracketed"] = 16] = "EnterBracketed";
    })(exports2.IterMode || (exports2.IterMode = {}));
    var Tree = class _Tree {
      /**
      Construct a new tree. See also [`Tree.build`](#common.Tree^build).
      */
      constructor(type, children, positions, length, props) {
        this.type = type;
        this.children = children;
        this.positions = positions;
        this.length = length;
        this.props = null;
        if (props && props.length) {
          this.props = /* @__PURE__ */ Object.create(null);
          for (let [prop, value] of props)
            this.props[typeof prop == "number" ? prop : prop.id] = value;
        }
      }
      /**
      @internal
      */
      toString() {
        let mounted = MountedTree.get(this);
        if (mounted && !mounted.overlay)
          return mounted.tree.toString();
        let children = "";
        for (let ch of this.children) {
          let str = ch.toString();
          if (str) {
            if (children)
              children += ",";
            children += str;
          }
        }
        return !this.type.name ? children : (/\W/.test(this.type.name) && !this.type.isError ? JSON.stringify(this.type.name) : this.type.name) + (children.length ? "(" + children + ")" : "");
      }
      /**
      Get a [tree cursor](#common.TreeCursor) positioned at the top of
      the tree. Mode can be used to [control](#common.IterMode) which
      nodes the cursor visits.
      */
      cursor(mode = 0) {
        return new TreeCursor(this.topNode, mode);
      }
      /**
      Get a [tree cursor](#common.TreeCursor) pointing into this tree
      at the given position and side (see
      [`moveTo`](#common.TreeCursor.moveTo).
      */
      cursorAt(pos, side = 0, mode = 0) {
        let scope = CachedNode.get(this) || this.topNode;
        let cursor = new TreeCursor(scope);
        cursor.moveTo(pos, side);
        CachedNode.set(this, cursor._tree);
        return cursor;
      }
      /**
      Get a [syntax node](#common.SyntaxNode) object for the top of the
      tree.
      */
      get topNode() {
        return new TreeNode(this, 0, 0, null);
      }
      /**
      Get the [syntax node](#common.SyntaxNode) at the given position.
      If `side` is -1, this will move into nodes that end at the
      position. If 1, it'll move into nodes that start at the
      position. With 0, it'll only enter nodes that cover the position
      from both sides.
      
      Note that this will not enter
      [overlays](#common.MountedTree.overlay), and you often want
      [`resolveInner`](#common.Tree.resolveInner) instead.
      */
      resolve(pos, side = 0) {
        let node = resolveNode(CachedNode.get(this) || this.topNode, pos, side, false);
        CachedNode.set(this, node);
        return node;
      }
      /**
      Like [`resolve`](#common.Tree.resolve), but will enter
      [overlaid](#common.MountedTree.overlay) nodes, producing a syntax node
      pointing into the innermost overlaid tree at the given position
      (with parent links going through all parent structure, including
      the host trees).
      */
      resolveInner(pos, side = 0) {
        let node = resolveNode(CachedInnerNode.get(this) || this.topNode, pos, side, true);
        CachedInnerNode.set(this, node);
        return node;
      }
      /**
      In some situations, it can be useful to iterate through all
      nodes around a position, including those in overlays that don't
      directly cover the position. This method gives you an iterator
      that will produce all nodes, from small to big, around the given
      position.
      */
      resolveStack(pos, side = 0) {
        return stackIterator(this, pos, side);
      }
      /**
      Iterate over the tree and its children, calling `enter` for any
      node that touches the `from`/`to` region (if given) before
      running over such a node's children, and `leave` (if given) when
      leaving the node. When `enter` returns `false`, that node will
      not have its children iterated over (or `leave` called).
      */
      iterate(spec) {
        let { enter, leave, from = 0, to = this.length } = spec;
        let mode = spec.mode || 0, anon = (mode & exports2.IterMode.IncludeAnonymous) > 0;
        for (let c = this.cursor(mode | exports2.IterMode.IncludeAnonymous); ; ) {
          let entered = false;
          if (c.from <= to && c.to >= from && (!anon && c.type.isAnonymous || enter(c) !== false)) {
            if (c.firstChild())
              continue;
            entered = true;
          }
          for (; ; ) {
            if (entered && leave && (anon || !c.type.isAnonymous))
              leave(c);
            if (c.nextSibling())
              break;
            if (!c.parent())
              return;
            entered = true;
          }
        }
      }
      /**
      Get the value of the given [node prop](#common.NodeProp) for this
      node. Works with both per-node and per-type props.
      */
      prop(prop) {
        return !prop.perNode ? this.type.prop(prop) : this.props ? this.props[prop.id] : void 0;
      }
      /**
      Returns the node's [per-node props](#common.NodeProp.perNode) in a
      format that can be passed to the [`Tree`](#common.Tree)
      constructor.
      */
      get propValues() {
        let result = [];
        if (this.props)
          for (let id in this.props)
            result.push([+id, this.props[id]]);
        return result;
      }
      /**
      Balance the direct children of this tree, producing a copy of
      which may have children grouped into subtrees with type
      [`NodeType.none`](#common.NodeType^none).
      */
      balance(config = {}) {
        return this.children.length <= 8 ? this : balanceRange(NodeType.none, this.children, this.positions, 0, this.children.length, 0, this.length, (children, positions, length) => new _Tree(this.type, children, positions, length, this.propValues), config.makeTree || ((children, positions, length) => new _Tree(NodeType.none, children, positions, length)));
      }
      /**
      Build a tree from a postfix-ordered buffer of node information,
      or a cursor over such a buffer.
      */
      static build(data) {
        return buildTree(data);
      }
    };
    Tree.empty = new Tree(NodeType.none, [], [], 0);
    var FlatBufferCursor = class _FlatBufferCursor {
      constructor(buffer, index) {
        this.buffer = buffer;
        this.index = index;
      }
      get id() {
        return this.buffer[this.index - 4];
      }
      get start() {
        return this.buffer[this.index - 3];
      }
      get end() {
        return this.buffer[this.index - 2];
      }
      get size() {
        return this.buffer[this.index - 1];
      }
      get pos() {
        return this.index;
      }
      next() {
        this.index -= 4;
      }
      fork() {
        return new _FlatBufferCursor(this.buffer, this.index);
      }
    };
    var TreeBuffer = class _TreeBuffer {
      /**
      Create a tree buffer.
      */
      constructor(buffer, length, set) {
        this.buffer = buffer;
        this.length = length;
        this.set = set;
      }
      /**
      @internal
      */
      get type() {
        return NodeType.none;
      }
      /**
      @internal
      */
      toString() {
        let result = [];
        for (let index = 0; index < this.buffer.length; ) {
          result.push(this.childString(index));
          index = this.buffer[index + 3];
        }
        return result.join(",");
      }
      /**
      @internal
      */
      childString(index) {
        let id = this.buffer[index], endIndex = this.buffer[index + 3];
        let type = this.set.types[id], result = type.name;
        if (/\W/.test(result) && !type.isError)
          result = JSON.stringify(result);
        index += 4;
        if (endIndex == index)
          return result;
        let children = [];
        while (index < endIndex) {
          children.push(this.childString(index));
          index = this.buffer[index + 3];
        }
        return result + "(" + children.join(",") + ")";
      }
      /**
      @internal
      */
      findChild(startIndex, endIndex, dir, pos, side) {
        let { buffer } = this, pick = -1;
        for (let i = startIndex; i != endIndex; i = buffer[i + 3]) {
          if (checkSide(side, pos, buffer[i + 1], buffer[i + 2])) {
            pick = i;
            if (dir > 0)
              break;
          }
        }
        return pick;
      }
      /**
      @internal
      */
      slice(startI, endI, from) {
        let b = this.buffer;
        let copy = new Uint16Array(endI - startI), len = 0;
        for (let i = startI, j = 0; i < endI; ) {
          copy[j++] = b[i++];
          copy[j++] = b[i++] - from;
          let to = copy[j++] = b[i++] - from;
          copy[j++] = b[i++] - startI;
          len = Math.max(len, to);
        }
        return new _TreeBuffer(copy, len, this.set);
      }
    };
    function checkSide(side, pos, from, to) {
      switch (side) {
        case -2:
          return from < pos;
        case -1:
          return to >= pos && from < pos;
        case 0:
          return from < pos && to > pos;
        case 1:
          return from <= pos && to > pos;
        case 2:
          return to > pos;
        case 4:
          return true;
      }
    }
    function resolveNode(node, pos, side, overlays) {
      var _a;
      while (node.from == node.to || (side < 1 ? node.from >= pos : node.from > pos) || (side > -1 ? node.to <= pos : node.to < pos)) {
        let parent = !overlays && node instanceof TreeNode && node.index < 0 ? null : node.parent;
        if (!parent)
          return node;
        node = parent;
      }
      let mode = overlays ? 0 : exports2.IterMode.IgnoreOverlays;
      if (overlays)
        for (let scan = node, parent = scan.parent; parent; scan = parent, parent = scan.parent) {
          if (scan instanceof TreeNode && scan.index < 0 && ((_a = parent.enter(pos, side, mode)) === null || _a === void 0 ? void 0 : _a.from) != scan.from)
            node = parent;
        }
      for (; ; ) {
        let inner = node.enter(pos, side, mode);
        if (!inner)
          return node;
        node = inner;
      }
    }
    var BaseNode = class {
      cursor(mode = 0) {
        return new TreeCursor(this, mode);
      }
      getChild(type, before = null, after = null) {
        let r = getChildren(this, type, before, after);
        return r.length ? r[0] : null;
      }
      getChildren(type, before = null, after = null) {
        return getChildren(this, type, before, after);
      }
      resolve(pos, side = 0) {
        return resolveNode(this, pos, side, false);
      }
      resolveInner(pos, side = 0) {
        return resolveNode(this, pos, side, true);
      }
      matchContext(context) {
        return matchNodeContext(this.parent, context);
      }
      enterUnfinishedNodesBefore(pos) {
        let scan = this.childBefore(pos), node = this;
        while (scan) {
          let last = scan.lastChild;
          if (!last || last.to != scan.to)
            break;
          if (last.type.isError && last.from == last.to) {
            node = scan;
            scan = last.prevSibling;
          } else {
            scan = last;
          }
        }
        return node;
      }
      get node() {
        return this;
      }
      get next() {
        return this.parent;
      }
    };
    var TreeNode = class _TreeNode extends BaseNode {
      constructor(_tree, from, index, _parent) {
        super();
        this._tree = _tree;
        this.from = from;
        this.index = index;
        this._parent = _parent;
      }
      get type() {
        return this._tree.type;
      }
      get name() {
        return this._tree.type.name;
      }
      get to() {
        return this.from + this._tree.length;
      }
      nextChild(i, dir, pos, side, mode = 0) {
        for (let parent = this; ; ) {
          for (let { children, positions } = parent._tree, e = dir > 0 ? children.length : -1; i != e; i += dir) {
            let next = children[i], start = positions[i] + parent.from, mounted;
            if (!(mode & exports2.IterMode.EnterBracketed && next instanceof Tree && (mounted = MountedTree.get(next)) && !mounted.overlay && mounted.bracketed && pos >= start && pos <= start + next.length) && !checkSide(side, pos, start, start + next.length))
              continue;
            if (next instanceof TreeBuffer) {
              if (mode & exports2.IterMode.ExcludeBuffers)
                continue;
              let index = next.findChild(0, next.buffer.length, dir, pos - start, side);
              if (index > -1)
                return new BufferNode(new BufferContext(parent, next, i, start), null, index);
            } else if (mode & exports2.IterMode.IncludeAnonymous || (!next.type.isAnonymous || hasChild(next))) {
              let mounted2;
              if (!(mode & exports2.IterMode.IgnoreMounts) && (mounted2 = MountedTree.get(next)) && !mounted2.overlay)
                return new _TreeNode(mounted2.tree, start, i, parent);
              let inner = new _TreeNode(next, start, i, parent);
              return mode & exports2.IterMode.IncludeAnonymous || !inner.type.isAnonymous ? inner : inner.nextChild(dir < 0 ? next.children.length - 1 : 0, dir, pos, side, mode);
            }
          }
          if (mode & exports2.IterMode.IncludeAnonymous || !parent.type.isAnonymous)
            return null;
          if (parent.index >= 0)
            i = parent.index + dir;
          else
            i = dir < 0 ? -1 : parent._parent._tree.children.length;
          parent = parent._parent;
          if (!parent)
            return null;
        }
      }
      get firstChild() {
        return this.nextChild(
          0,
          1,
          0,
          4
          /* Side.DontCare */
        );
      }
      get lastChild() {
        return this.nextChild(
          this._tree.children.length - 1,
          -1,
          0,
          4
          /* Side.DontCare */
        );
      }
      childAfter(pos) {
        return this.nextChild(
          0,
          1,
          pos,
          2
          /* Side.After */
        );
      }
      childBefore(pos) {
        return this.nextChild(
          this._tree.children.length - 1,
          -1,
          pos,
          -2
          /* Side.Before */
        );
      }
      prop(prop) {
        return this._tree.prop(prop);
      }
      enter(pos, side, mode = 0) {
        let mounted;
        if (!(mode & exports2.IterMode.IgnoreOverlays) && (mounted = MountedTree.get(this._tree)) && mounted.overlay) {
          let rPos = pos - this.from, enterBracketed = mode & exports2.IterMode.EnterBracketed && mounted.bracketed;
          for (let { from, to } of mounted.overlay) {
            if ((side > 0 || enterBracketed ? from <= rPos : from < rPos) && (side < 0 || enterBracketed ? to >= rPos : to > rPos))
              return new _TreeNode(mounted.tree, mounted.overlay[0].from + this.from, -1, this);
          }
        }
        return this.nextChild(0, 1, pos, side, mode);
      }
      nextSignificantParent() {
        let val = this;
        while (val.type.isAnonymous && val._parent)
          val = val._parent;
        return val;
      }
      get parent() {
        return this._parent ? this._parent.nextSignificantParent() : null;
      }
      get nextSibling() {
        return this._parent && this.index >= 0 ? this._parent.nextChild(
          this.index + 1,
          1,
          0,
          4
          /* Side.DontCare */
        ) : null;
      }
      get prevSibling() {
        return this._parent && this.index >= 0 ? this._parent.nextChild(
          this.index - 1,
          -1,
          0,
          4
          /* Side.DontCare */
        ) : null;
      }
      get tree() {
        return this._tree;
      }
      toTree() {
        return this._tree;
      }
      /**
      @internal
      */
      toString() {
        return this._tree.toString();
      }
    };
    function getChildren(node, type, before, after) {
      let cur = node.cursor(), result = [];
      if (!cur.firstChild())
        return result;
      if (before != null)
        for (let found = false; !found; ) {
          found = cur.type.is(before);
          if (!cur.nextSibling())
            return result;
        }
      for (; ; ) {
        if (after != null && cur.type.is(after))
          return result;
        if (cur.type.is(type))
          result.push(cur.node);
        if (!cur.nextSibling())
          return after == null ? result : [];
      }
    }
    function matchNodeContext(node, context, i = context.length - 1) {
      for (let p = node; i >= 0; p = p.parent) {
        if (!p)
          return false;
        if (!p.type.isAnonymous) {
          if (context[i] && context[i] != p.name)
            return false;
          i--;
        }
      }
      return true;
    }
    var BufferContext = class {
      constructor(parent, buffer, index, start) {
        this.parent = parent;
        this.buffer = buffer;
        this.index = index;
        this.start = start;
      }
    };
    var BufferNode = class _BufferNode extends BaseNode {
      get name() {
        return this.type.name;
      }
      get from() {
        return this.context.start + this.context.buffer.buffer[this.index + 1];
      }
      get to() {
        return this.context.start + this.context.buffer.buffer[this.index + 2];
      }
      constructor(context, _parent, index) {
        super();
        this.context = context;
        this._parent = _parent;
        this.index = index;
        this.type = context.buffer.set.types[context.buffer.buffer[index]];
      }
      child(dir, pos, side) {
        let { buffer } = this.context;
        let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.context.start, side);
        return index < 0 ? null : new _BufferNode(this.context, this, index);
      }
      get firstChild() {
        return this.child(
          1,
          0,
          4
          /* Side.DontCare */
        );
      }
      get lastChild() {
        return this.child(
          -1,
          0,
          4
          /* Side.DontCare */
        );
      }
      childAfter(pos) {
        return this.child(
          1,
          pos,
          2
          /* Side.After */
        );
      }
      childBefore(pos) {
        return this.child(
          -1,
          pos,
          -2
          /* Side.Before */
        );
      }
      prop(prop) {
        return this.type.prop(prop);
      }
      enter(pos, side, mode = 0) {
        if (mode & exports2.IterMode.ExcludeBuffers)
          return null;
        let { buffer } = this.context;
        let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], side > 0 ? 1 : -1, pos - this.context.start, side);
        return index < 0 ? null : new _BufferNode(this.context, this, index);
      }
      get parent() {
        return this._parent || this.context.parent.nextSignificantParent();
      }
      externalSibling(dir) {
        return this._parent ? null : this.context.parent.nextChild(
          this.context.index + dir,
          dir,
          0,
          4
          /* Side.DontCare */
        );
      }
      get nextSibling() {
        let { buffer } = this.context;
        let after = buffer.buffer[this.index + 3];
        if (after < (this._parent ? buffer.buffer[this._parent.index + 3] : buffer.buffer.length))
          return new _BufferNode(this.context, this._parent, after);
        return this.externalSibling(1);
      }
      get prevSibling() {
        let { buffer } = this.context;
        let parentStart = this._parent ? this._parent.index + 4 : 0;
        if (this.index == parentStart)
          return this.externalSibling(-1);
        return new _BufferNode(this.context, this._parent, buffer.findChild(
          parentStart,
          this.index,
          -1,
          0,
          4
          /* Side.DontCare */
        ));
      }
      get tree() {
        return null;
      }
      toTree() {
        let children = [], positions = [];
        let { buffer } = this.context;
        let startI = this.index + 4, endI = buffer.buffer[this.index + 3];
        if (endI > startI) {
          let from = buffer.buffer[this.index + 1];
          children.push(buffer.slice(startI, endI, from));
          positions.push(0);
        }
        return new Tree(this.type, children, positions, this.to - this.from);
      }
      /**
      @internal
      */
      toString() {
        return this.context.buffer.childString(this.index);
      }
    };
    function iterStack(heads) {
      if (!heads.length)
        return null;
      let pick = 0, picked = heads[0];
      for (let i = 1; i < heads.length; i++) {
        let node = heads[i];
        if (node.from > picked.from || node.to < picked.to) {
          picked = node;
          pick = i;
        }
      }
      let next = picked instanceof TreeNode && picked.index < 0 ? null : picked.parent;
      let newHeads = heads.slice();
      if (next)
        newHeads[pick] = next;
      else
        newHeads.splice(pick, 1);
      return new StackIterator(newHeads, picked);
    }
    var StackIterator = class {
      constructor(heads, node) {
        this.heads = heads;
        this.node = node;
      }
      get next() {
        return iterStack(this.heads);
      }
    };
    function stackIterator(tree, pos, side) {
      let inner = tree.resolveInner(pos, side), layers = null;
      for (let scan = inner instanceof TreeNode ? inner : inner.context.parent; scan; scan = scan.parent) {
        if (scan.index < 0) {
          let parent = scan.parent;
          (layers || (layers = [inner])).push(parent.resolve(pos, side));
          scan = parent;
        } else {
          let mount = MountedTree.get(scan.tree);
          if (mount && mount.overlay && mount.overlay[0].from <= pos && mount.overlay[mount.overlay.length - 1].to >= pos) {
            let root = new TreeNode(mount.tree, mount.overlay[0].from + scan.from, -1, scan);
            (layers || (layers = [inner])).push(resolveNode(root, pos, side, false));
          }
        }
      }
      return layers ? iterStack(layers) : inner;
    }
    var TreeCursor = class {
      /**
      Shorthand for `.type.name`.
      */
      get name() {
        return this.type.name;
      }
      /**
      @internal
      */
      constructor(node, mode = 0) {
        this.buffer = null;
        this.stack = [];
        this.index = 0;
        this.bufferNode = null;
        this.mode = mode & ~exports2.IterMode.EnterBracketed;
        if (node instanceof TreeNode) {
          this.yieldNode(node);
        } else {
          this._tree = node.context.parent;
          this.buffer = node.context;
          for (let n = node._parent; n; n = n._parent)
            this.stack.unshift(n.index);
          this.bufferNode = node;
          this.yieldBuf(node.index);
        }
      }
      yieldNode(node) {
        if (!node)
          return false;
        this._tree = node;
        this.type = node.type;
        this.from = node.from;
        this.to = node.to;
        return true;
      }
      yieldBuf(index, type) {
        this.index = index;
        let { start, buffer } = this.buffer;
        this.type = type || buffer.set.types[buffer.buffer[index]];
        this.from = start + buffer.buffer[index + 1];
        this.to = start + buffer.buffer[index + 2];
        return true;
      }
      /**
      @internal
      */
      yield(node) {
        if (!node)
          return false;
        if (node instanceof TreeNode) {
          this.buffer = null;
          return this.yieldNode(node);
        }
        this.buffer = node.context;
        return this.yieldBuf(node.index, node.type);
      }
      /**
      @internal
      */
      toString() {
        return this.buffer ? this.buffer.buffer.childString(this.index) : this._tree.toString();
      }
      /**
      @internal
      */
      enterChild(dir, pos, side) {
        if (!this.buffer)
          return this.yield(this._tree.nextChild(dir < 0 ? this._tree._tree.children.length - 1 : 0, dir, pos, side, this.mode));
        let { buffer } = this.buffer;
        let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.buffer.start, side);
        if (index < 0)
          return false;
        this.stack.push(this.index);
        return this.yieldBuf(index);
      }
      /**
      Move the cursor to this node's first child. When this returns
      false, the node has no child, and the cursor has not been moved.
      */
      firstChild() {
        return this.enterChild(
          1,
          0,
          4
          /* Side.DontCare */
        );
      }
      /**
      Move the cursor to this node's last child.
      */
      lastChild() {
        return this.enterChild(
          -1,
          0,
          4
          /* Side.DontCare */
        );
      }
      /**
      Move the cursor to the first child that ends after `pos`.
      */
      childAfter(pos) {
        return this.enterChild(
          1,
          pos,
          2
          /* Side.After */
        );
      }
      /**
      Move to the last child that starts before `pos`.
      */
      childBefore(pos) {
        return this.enterChild(
          -1,
          pos,
          -2
          /* Side.Before */
        );
      }
      /**
      Move the cursor to the child around `pos`. If side is -1 the
      child may end at that position, when 1 it may start there. This
      will also enter [overlaid](#common.MountedTree.overlay)
      [mounted](#common.NodeProp^mounted) trees unless `overlays` is
      set to false.
      */
      enter(pos, side, mode = this.mode) {
        if (!this.buffer)
          return this.yield(this._tree.enter(pos, side, mode));
        return mode & exports2.IterMode.ExcludeBuffers ? false : this.enterChild(1, pos, side);
      }
      /**
      Move to the node's parent node, if this isn't the top node.
      */
      parent() {
        if (!this.buffer)
          return this.yieldNode(this.mode & exports2.IterMode.IncludeAnonymous ? this._tree._parent : this._tree.parent);
        if (this.stack.length)
          return this.yieldBuf(this.stack.pop());
        let parent = this.mode & exports2.IterMode.IncludeAnonymous ? this.buffer.parent : this.buffer.parent.nextSignificantParent();
        this.buffer = null;
        return this.yieldNode(parent);
      }
      /**
      @internal
      */
      sibling(dir) {
        if (!this.buffer)
          return !this._tree._parent ? false : this.yield(this._tree.index < 0 ? null : this._tree._parent.nextChild(this._tree.index + dir, dir, 0, 4, this.mode));
        let { buffer } = this.buffer, d = this.stack.length - 1;
        if (dir < 0) {
          let parentStart = d < 0 ? 0 : this.stack[d] + 4;
          if (this.index != parentStart)
            return this.yieldBuf(buffer.findChild(
              parentStart,
              this.index,
              -1,
              0,
              4
              /* Side.DontCare */
            ));
        } else {
          let after = buffer.buffer[this.index + 3];
          if (after < (d < 0 ? buffer.buffer.length : buffer.buffer[this.stack[d] + 3]))
            return this.yieldBuf(after);
        }
        return d < 0 ? this.yield(this.buffer.parent.nextChild(this.buffer.index + dir, dir, 0, 4, this.mode)) : false;
      }
      /**
      Move to this node's next sibling, if any.
      */
      nextSibling() {
        return this.sibling(1);
      }
      /**
      Move to this node's previous sibling, if any.
      */
      prevSibling() {
        return this.sibling(-1);
      }
      atLastNode(dir) {
        let index, parent, { buffer } = this;
        if (buffer) {
          if (dir > 0) {
            if (this.index < buffer.buffer.buffer.length)
              return false;
          } else {
            for (let i = 0; i < this.index; i++)
              if (buffer.buffer.buffer[i + 3] < this.index)
                return false;
          }
          ({ index, parent } = buffer);
        } else {
          ({ index, _parent: parent } = this._tree);
        }
        for (; parent; { index, _parent: parent } = parent) {
          if (index > -1)
            for (let i = index + dir, e = dir < 0 ? -1 : parent._tree.children.length; i != e; i += dir) {
              let child = parent._tree.children[i];
              if (this.mode & exports2.IterMode.IncludeAnonymous || child instanceof TreeBuffer || !child.type.isAnonymous || hasChild(child))
                return false;
            }
        }
        return true;
      }
      move(dir, enter) {
        if (enter && this.enterChild(
          dir,
          0,
          4
          /* Side.DontCare */
        ))
          return true;
        for (; ; ) {
          if (this.sibling(dir))
            return true;
          if (this.atLastNode(dir) || !this.parent())
            return false;
        }
      }
      /**
      Move to the next node in a
      [pre-order](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order,_NLR)
      traversal, going from a node to its first child or, if the
      current node is empty or `enter` is false, its next sibling or
      the next sibling of the first parent node that has one.
      */
      next(enter = true) {
        return this.move(1, enter);
      }
      /**
      Move to the next node in a last-to-first pre-order traversal. A
      node is followed by its last child or, if it has none, its
      previous sibling or the previous sibling of the first parent
      node that has one.
      */
      prev(enter = true) {
        return this.move(-1, enter);
      }
      /**
      Move the cursor to the innermost node that covers `pos`. If
      `side` is -1, it will enter nodes that end at `pos`. If it is 1,
      it will enter nodes that start at `pos`.
      */
      moveTo(pos, side = 0) {
        while (this.from == this.to || (side < 1 ? this.from >= pos : this.from > pos) || (side > -1 ? this.to <= pos : this.to < pos))
          if (!this.parent())
            break;
        while (this.enterChild(1, pos, side)) {
        }
        return this;
      }
      /**
      Get a [syntax node](#common.SyntaxNode) at the cursor's current
      position.
      */
      get node() {
        if (!this.buffer)
          return this._tree;
        let cache = this.bufferNode, result = null, depth = 0;
        if (cache && cache.context == this.buffer) {
          scan: for (let index = this.index, d = this.stack.length; d >= 0; ) {
            for (let c = cache; c; c = c._parent)
              if (c.index == index) {
                if (index == this.index)
                  return c;
                result = c;
                depth = d + 1;
                break scan;
              }
            index = this.stack[--d];
          }
        }
        for (let i = depth; i < this.stack.length; i++)
          result = new BufferNode(this.buffer, result, this.stack[i]);
        return this.bufferNode = new BufferNode(this.buffer, result, this.index);
      }
      /**
      Get the [tree](#common.Tree) that represents the current node, if
      any. Will return null when the node is in a [tree
      buffer](#common.TreeBuffer).
      */
      get tree() {
        return this.buffer ? null : this._tree._tree;
      }
      /**
      Iterate over the current node and all its descendants, calling
      `enter` when entering a node and `leave`, if given, when leaving
      one. When `enter` returns `false`, any children of that node are
      skipped, and `leave` isn't called for it.
      */
      iterate(enter, leave) {
        for (let depth = 0; ; ) {
          let mustLeave = false;
          if (this.type.isAnonymous || enter(this) !== false) {
            if (this.firstChild()) {
              depth++;
              continue;
            }
            if (!this.type.isAnonymous)
              mustLeave = true;
          }
          for (; ; ) {
            if (mustLeave && leave)
              leave(this);
            mustLeave = this.type.isAnonymous;
            if (!depth)
              return;
            if (this.nextSibling())
              break;
            this.parent();
            depth--;
            mustLeave = true;
          }
        }
      }
      /**
      Test whether the current node matches a given context—a sequence
      of direct parent node names. Empty strings in the context array
      are treated as wildcards.
      */
      matchContext(context) {
        if (!this.buffer)
          return matchNodeContext(this.node.parent, context);
        let { buffer } = this.buffer, { types } = buffer.set;
        for (let i = context.length - 1, d = this.stack.length - 1; i >= 0; d--) {
          if (d < 0)
            return matchNodeContext(this._tree, context, i);
          let type = types[buffer.buffer[this.stack[d]]];
          if (!type.isAnonymous) {
            if (context[i] && context[i] != type.name)
              return false;
            i--;
          }
        }
        return true;
      }
    };
    function hasChild(tree) {
      return tree.children.some((ch) => ch instanceof TreeBuffer || !ch.type.isAnonymous || hasChild(ch));
    }
    function buildTree(data) {
      var _a;
      let { buffer, nodeSet, maxBufferLength = DefaultBufferLength, reused = [], minRepeatType = nodeSet.types.length } = data;
      let cursor = Array.isArray(buffer) ? new FlatBufferCursor(buffer, buffer.length) : buffer;
      let types = nodeSet.types;
      let contextHash = 0, lookAhead = 0;
      function takeNode(parentStart, minPos, children2, positions2, inRepeat, depth) {
        let { id, start, end, size } = cursor;
        let lookAheadAtStart = lookAhead, contextAtStart = contextHash;
        if (size < 0) {
          cursor.next();
          if (size == -1) {
            let node2 = reused[id];
            children2.push(node2);
            positions2.push(start - parentStart);
            return;
          } else if (size == -3) {
            contextHash = id;
            return;
          } else if (size == -4) {
            lookAhead = id;
            return;
          } else {
            throw new RangeError(`Unrecognized record size: ${size}`);
          }
        }
        let type = types[id], node, buffer2;
        let startPos = start - parentStart;
        if (end - start <= maxBufferLength && (buffer2 = findBufferSize(cursor.pos - minPos, inRepeat))) {
          let data2 = new Uint16Array(buffer2.size - buffer2.skip);
          let endPos = cursor.pos - buffer2.size, index = data2.length;
          while (cursor.pos > endPos)
            index = copyToBuffer(buffer2.start, data2, index);
          node = new TreeBuffer(data2, end - buffer2.start, nodeSet);
          startPos = buffer2.start - parentStart;
        } else {
          let endPos = cursor.pos - size;
          cursor.next();
          let localChildren = [], localPositions = [];
          let localInRepeat = id >= minRepeatType ? id : -1;
          let lastGroup = 0, lastEnd = end;
          while (cursor.pos > endPos) {
            if (localInRepeat >= 0 && cursor.id == localInRepeat && cursor.size >= 0) {
              if (cursor.end <= lastEnd - maxBufferLength) {
                makeRepeatLeaf(localChildren, localPositions, start, lastGroup, cursor.end, lastEnd, localInRepeat, lookAheadAtStart, contextAtStart);
                lastGroup = localChildren.length;
                lastEnd = cursor.end;
              }
              cursor.next();
            } else if (depth > 2500) {
              takeFlatNode(start, endPos, localChildren, localPositions);
            } else {
              takeNode(start, endPos, localChildren, localPositions, localInRepeat, depth + 1);
            }
          }
          if (localInRepeat >= 0 && lastGroup > 0 && lastGroup < localChildren.length)
            makeRepeatLeaf(localChildren, localPositions, start, lastGroup, start, lastEnd, localInRepeat, lookAheadAtStart, contextAtStart);
          localChildren.reverse();
          localPositions.reverse();
          if (localInRepeat > -1 && lastGroup > 0) {
            let make = makeBalanced(type, contextAtStart);
            node = balanceRange(type, localChildren, localPositions, 0, localChildren.length, 0, end - start, make, make);
          } else {
            node = makeTree(type, localChildren, localPositions, end - start, lookAheadAtStart - end, contextAtStart);
          }
        }
        children2.push(node);
        positions2.push(startPos);
      }
      function takeFlatNode(parentStart, minPos, children2, positions2) {
        let nodes = [];
        let nodeCount = 0, stopAt = -1;
        while (cursor.pos > minPos) {
          let { id, start, end, size } = cursor;
          if (size > 4) {
            cursor.next();
          } else if (stopAt > -1 && start < stopAt) {
            break;
          } else {
            if (stopAt < 0)
              stopAt = end - maxBufferLength;
            nodes.push(id, start, end);
            nodeCount++;
            cursor.next();
          }
        }
        if (nodeCount) {
          let buffer2 = new Uint16Array(nodeCount * 4);
          let start = nodes[nodes.length - 2];
          for (let i = nodes.length - 3, j = 0; i >= 0; i -= 3) {
            buffer2[j++] = nodes[i];
            buffer2[j++] = nodes[i + 1] - start;
            buffer2[j++] = nodes[i + 2] - start;
            buffer2[j++] = j;
          }
          children2.push(new TreeBuffer(buffer2, nodes[2] - start, nodeSet));
          positions2.push(start - parentStart);
        }
      }
      function makeBalanced(type, contextHash2) {
        return (children2, positions2, length2) => {
          let lookAhead2 = 0, lastI = children2.length - 1, last, lookAheadProp;
          if (lastI >= 0 && (last = children2[lastI]) instanceof Tree) {
            if (!lastI && last.type == type && last.length == length2)
              return last;
            if (lookAheadProp = last.prop(NodeProp.lookAhead))
              lookAhead2 = positions2[lastI] + last.length + lookAheadProp;
          }
          return makeTree(type, children2, positions2, length2, lookAhead2, contextHash2);
        };
      }
      function makeRepeatLeaf(children2, positions2, base, i, from, to, type, lookAhead2, contextHash2) {
        let localChildren = [], localPositions = [];
        while (children2.length > i) {
          localChildren.push(children2.pop());
          localPositions.push(positions2.pop() + base - from);
        }
        children2.push(makeTree(nodeSet.types[type], localChildren, localPositions, to - from, lookAhead2 - to, contextHash2));
        positions2.push(from - base);
      }
      function makeTree(type, children2, positions2, length2, lookAhead2, contextHash2, props) {
        if (contextHash2) {
          let pair = [NodeProp.contextHash, contextHash2];
          props = props ? [pair].concat(props) : [pair];
        }
        if (lookAhead2 > 25) {
          let pair = [NodeProp.lookAhead, lookAhead2];
          props = props ? [pair].concat(props) : [pair];
        }
        return new Tree(type, children2, positions2, length2, props);
      }
      function findBufferSize(maxSize, inRepeat) {
        let fork = cursor.fork();
        let size = 0, start = 0, skip = 0, minStart = fork.end - maxBufferLength;
        let result = { size: 0, start: 0, skip: 0 };
        scan: for (let minPos = fork.pos - maxSize; fork.pos > minPos; ) {
          let nodeSize2 = fork.size;
          if (fork.id == inRepeat && nodeSize2 >= 0) {
            result.size = size;
            result.start = start;
            result.skip = skip;
            skip += 4;
            size += 4;
            fork.next();
            continue;
          }
          let startPos = fork.pos - nodeSize2;
          if (nodeSize2 < 0 || startPos < minPos || fork.start < minStart)
            break;
          let localSkipped = fork.id >= minRepeatType ? 4 : 0;
          let nodeStart = fork.start;
          fork.next();
          while (fork.pos > startPos) {
            if (fork.size < 0) {
              if (fork.size == -3 || fork.size == -4)
                localSkipped += 4;
              else
                break scan;
            } else if (fork.id >= minRepeatType) {
              localSkipped += 4;
            }
            fork.next();
          }
          start = nodeStart;
          size += nodeSize2;
          skip += localSkipped;
        }
        if (inRepeat < 0 || size == maxSize) {
          result.size = size;
          result.start = start;
          result.skip = skip;
        }
        return result.size > 4 ? result : void 0;
      }
      function copyToBuffer(bufferStart, buffer2, index) {
        let { id, start, end, size } = cursor;
        cursor.next();
        if (size >= 0 && id < minRepeatType) {
          let startIndex = index;
          if (size > 4) {
            let endPos = cursor.pos - (size - 4);
            while (cursor.pos > endPos)
              index = copyToBuffer(bufferStart, buffer2, index);
          }
          buffer2[--index] = startIndex;
          buffer2[--index] = end - bufferStart;
          buffer2[--index] = start - bufferStart;
          buffer2[--index] = id;
        } else if (size == -3) {
          contextHash = id;
        } else if (size == -4) {
          lookAhead = id;
        }
        return index;
      }
      let children = [], positions = [];
      while (cursor.pos > 0)
        takeNode(data.start || 0, data.bufferStart || 0, children, positions, -1, 0);
      let length = (_a = data.length) !== null && _a !== void 0 ? _a : children.length ? positions[0] + children[0].length : 0;
      return new Tree(types[data.topID], children.reverse(), positions.reverse(), length);
    }
    var nodeSizeCache = /* @__PURE__ */ new WeakMap();
    function nodeSize(balanceType, node) {
      if (!balanceType.isAnonymous || node instanceof TreeBuffer || node.type != balanceType)
        return 1;
      let size = nodeSizeCache.get(node);
      if (size == null) {
        size = 1;
        for (let child of node.children) {
          if (child.type != balanceType || !(child instanceof Tree)) {
            size = 1;
            break;
          }
          size += nodeSize(balanceType, child);
        }
        nodeSizeCache.set(node, size);
      }
      return size;
    }
    function balanceRange(balanceType, children, positions, from, to, start, length, mkTop, mkTree) {
      let total = 0;
      for (let i = from; i < to; i++)
        total += nodeSize(balanceType, children[i]);
      let maxChild = Math.ceil(
        total * 1.5 / 8
        /* Balance.BranchFactor */
      );
      let localChildren = [], localPositions = [];
      function divide(children2, positions2, from2, to2, offset) {
        for (let i = from2; i < to2; ) {
          let groupFrom = i, groupStart = positions2[i], groupSize = nodeSize(balanceType, children2[i]);
          i++;
          for (; i < to2; i++) {
            let nextSize = nodeSize(balanceType, children2[i]);
            if (groupSize + nextSize >= maxChild)
              break;
            groupSize += nextSize;
          }
          if (i == groupFrom + 1) {
            if (groupSize > maxChild) {
              let only = children2[groupFrom];
              divide(only.children, only.positions, 0, only.children.length, positions2[groupFrom] + offset);
              continue;
            }
            localChildren.push(children2[groupFrom]);
          } else {
            let length2 = positions2[i - 1] + children2[i - 1].length - groupStart;
            localChildren.push(balanceRange(balanceType, children2, positions2, groupFrom, i, groupStart, length2, null, mkTree));
          }
          localPositions.push(groupStart + offset - start);
        }
      }
      divide(children, positions, from, to, 0);
      return (mkTop || mkTree)(localChildren, localPositions, length);
    }
    var NodeWeakMap = class {
      constructor() {
        this.map = /* @__PURE__ */ new WeakMap();
      }
      setBuffer(buffer, index, value) {
        let inner = this.map.get(buffer);
        if (!inner)
          this.map.set(buffer, inner = /* @__PURE__ */ new Map());
        inner.set(index, value);
      }
      getBuffer(buffer, index) {
        let inner = this.map.get(buffer);
        return inner && inner.get(index);
      }
      /**
      Set the value for this syntax node.
      */
      set(node, value) {
        if (node instanceof BufferNode)
          this.setBuffer(node.context.buffer, node.index, value);
        else if (node instanceof TreeNode)
          this.map.set(node.tree, value);
      }
      /**
      Retrieve value for this syntax node, if it exists in the map.
      */
      get(node) {
        return node instanceof BufferNode ? this.getBuffer(node.context.buffer, node.index) : node instanceof TreeNode ? this.map.get(node.tree) : void 0;
      }
      /**
      Set the value for the node that a cursor currently points to.
      */
      cursorSet(cursor, value) {
        if (cursor.buffer)
          this.setBuffer(cursor.buffer.buffer, cursor.index, value);
        else
          this.map.set(cursor.tree, value);
      }
      /**
      Retrieve the value for the node that a cursor currently points
      to.
      */
      cursorGet(cursor) {
        return cursor.buffer ? this.getBuffer(cursor.buffer.buffer, cursor.index) : this.map.get(cursor.tree);
      }
    };
    var TreeFragment = class _TreeFragment {
      /**
      Construct a tree fragment. You'll usually want to use
      [`addTree`](#common.TreeFragment^addTree) and
      [`applyChanges`](#common.TreeFragment^applyChanges) instead of
      calling this directly.
      */
      constructor(from, to, tree, offset, openStart = false, openEnd = false) {
        this.from = from;
        this.to = to;
        this.tree = tree;
        this.offset = offset;
        this.open = (openStart ? 1 : 0) | (openEnd ? 2 : 0);
      }
      /**
      Whether the start of the fragment represents the start of a
      parse, or the end of a change. (In the second case, it may not
      be safe to reuse some nodes at the start, depending on the
      parsing algorithm.)
      */
      get openStart() {
        return (this.open & 1) > 0;
      }
      /**
      Whether the end of the fragment represents the end of a
      full-document parse, or the start of a change.
      */
      get openEnd() {
        return (this.open & 2) > 0;
      }
      /**
      Create a set of fragments from a freshly parsed tree, or update
      an existing set of fragments by replacing the ones that overlap
      with a tree with content from the new tree. When `partial` is
      true, the parse is treated as incomplete, and the resulting
      fragment has [`openEnd`](#common.TreeFragment.openEnd) set to
      true.
      */
      static addTree(tree, fragments = [], partial = false) {
        let result = [new _TreeFragment(0, tree.length, tree, 0, false, partial)];
        for (let f of fragments)
          if (f.to > tree.length)
            result.push(f);
        return result;
      }
      /**
      Apply a set of edits to an array of fragments, removing or
      splitting fragments as necessary to remove edited ranges, and
      adjusting offsets for fragments that moved.
      */
      static applyChanges(fragments, changes, minGap = 128) {
        if (!changes.length)
          return fragments;
        let result = [];
        let fI = 1, nextF = fragments.length ? fragments[0] : null;
        for (let cI = 0, pos = 0, off = 0; ; cI++) {
          let nextC = cI < changes.length ? changes[cI] : null;
          let nextPos = nextC ? nextC.fromA : 1e9;
          if (nextPos - pos >= minGap)
            while (nextF && nextF.from < nextPos) {
              let cut = nextF;
              if (pos >= cut.from || nextPos <= cut.to || off) {
                let fFrom = Math.max(cut.from, pos) - off, fTo = Math.min(cut.to, nextPos) - off;
                cut = fFrom >= fTo ? null : new _TreeFragment(fFrom, fTo, cut.tree, cut.offset + off, cI > 0, !!nextC);
              }
              if (cut)
                result.push(cut);
              if (nextF.to > nextPos)
                break;
              nextF = fI < fragments.length ? fragments[fI++] : null;
            }
          if (!nextC)
            break;
          pos = nextC.toA;
          off = nextC.toA - nextC.toB;
        }
        return result;
      }
    };
    var Parser = class {
      /**
      Start a parse, returning a [partial parse](#common.PartialParse)
      object. [`fragments`](#common.TreeFragment) can be passed in to
      make the parse incremental.
      
      By default, the entire input is parsed. You can pass `ranges`,
      which should be a sorted array of non-empty, non-overlapping
      ranges, to parse only those ranges. The tree returned in that
      case will start at `ranges[0].from`.
      */
      startParse(input, fragments, ranges) {
        if (typeof input == "string")
          input = new StringInput(input);
        ranges = !ranges ? [new Range(0, input.length)] : ranges.length ? ranges.map((r) => new Range(r.from, r.to)) : [new Range(0, 0)];
        return this.createParse(input, fragments || [], ranges);
      }
      /**
      Run a full parse, returning the resulting tree.
      */
      parse(input, fragments, ranges) {
        let parse = this.startParse(input, fragments, ranges);
        for (; ; ) {
          let done = parse.advance();
          if (done)
            return done;
        }
      }
    };
    var StringInput = class {
      constructor(string) {
        this.string = string;
      }
      get length() {
        return this.string.length;
      }
      chunk(from) {
        return this.string.slice(from);
      }
      get lineChunks() {
        return false;
      }
      read(from, to) {
        return this.string.slice(from, to);
      }
    };
    function parseMixed(nest) {
      return (parse, input, fragments, ranges) => new MixedParse(parse, nest, input, fragments, ranges);
    }
    var InnerParse = class {
      constructor(parser2, parse, overlay, bracketed, target, from) {
        this.parser = parser2;
        this.parse = parse;
        this.overlay = overlay;
        this.bracketed = bracketed;
        this.target = target;
        this.from = from;
      }
    };
    function checkRanges(ranges) {
      if (!ranges.length || ranges.some((r) => r.from >= r.to))
        throw new RangeError("Invalid inner parse ranges given: " + JSON.stringify(ranges));
    }
    var ActiveOverlay = class {
      constructor(parser2, predicate, mounts, index, start, bracketed, target, prev) {
        this.parser = parser2;
        this.predicate = predicate;
        this.mounts = mounts;
        this.index = index;
        this.start = start;
        this.bracketed = bracketed;
        this.target = target;
        this.prev = prev;
        this.depth = 0;
        this.ranges = [];
      }
    };
    var stoppedInner = new NodeProp({ perNode: true });
    var MixedParse = class {
      constructor(base, nest, input, fragments, ranges) {
        this.nest = nest;
        this.input = input;
        this.fragments = fragments;
        this.ranges = ranges;
        this.inner = [];
        this.innerDone = 0;
        this.baseTree = null;
        this.stoppedAt = null;
        this.baseParse = base;
      }
      advance() {
        if (this.baseParse) {
          let done2 = this.baseParse.advance();
          if (!done2)
            return null;
          this.baseParse = null;
          this.baseTree = done2;
          this.startInner();
          if (this.stoppedAt != null)
            for (let inner2 of this.inner)
              inner2.parse.stopAt(this.stoppedAt);
        }
        if (this.innerDone == this.inner.length) {
          let result = this.baseTree;
          if (this.stoppedAt != null)
            result = new Tree(result.type, result.children, result.positions, result.length, result.propValues.concat([[stoppedInner, this.stoppedAt]]));
          return result;
        }
        let inner = this.inner[this.innerDone], done = inner.parse.advance();
        if (done) {
          this.innerDone++;
          let props = Object.assign(/* @__PURE__ */ Object.create(null), inner.target.props);
          props[NodeProp.mounted.id] = new MountedTree(done, inner.overlay, inner.parser, inner.bracketed);
          inner.target.props = props;
        }
        return null;
      }
      get parsedPos() {
        if (this.baseParse)
          return 0;
        let pos = this.input.length;
        for (let i = this.innerDone; i < this.inner.length; i++) {
          if (this.inner[i].from < pos)
            pos = Math.min(pos, this.inner[i].parse.parsedPos);
        }
        return pos;
      }
      stopAt(pos) {
        this.stoppedAt = pos;
        if (this.baseParse)
          this.baseParse.stopAt(pos);
        else
          for (let i = this.innerDone; i < this.inner.length; i++)
            this.inner[i].parse.stopAt(pos);
      }
      startInner() {
        let fragmentCursor = new FragmentCursor(this.fragments);
        let overlay = null;
        let covered = null;
        let cursor = new TreeCursor(new TreeNode(this.baseTree, this.ranges[0].from, 0, null), exports2.IterMode.IncludeAnonymous | exports2.IterMode.IgnoreMounts);
        scan: for (let nest, isCovered; ; ) {
          let enter = true, range;
          if (this.stoppedAt != null && cursor.from >= this.stoppedAt) {
            enter = false;
          } else if (fragmentCursor.hasNode(cursor)) {
            if (overlay) {
              let match = overlay.mounts.find((m) => m.frag.from <= cursor.from && m.frag.to >= cursor.to && m.mount.overlay);
              if (match)
                for (let r of match.mount.overlay) {
                  let from = r.from + match.pos, to = r.to + match.pos;
                  if (from >= cursor.from && to <= cursor.to && !overlay.ranges.some((r2) => r2.from < to && r2.to > from))
                    overlay.ranges.push({ from, to });
                }
            }
            enter = false;
          } else if (covered && (isCovered = checkCover(covered.ranges, cursor.from, cursor.to))) {
            enter = isCovered != 2;
          } else if (!cursor.type.isAnonymous && (nest = this.nest(cursor, this.input)) && (cursor.from < cursor.to || !nest.overlay)) {
            if (!cursor.tree) {
              materialize(cursor);
              if (overlay)
                overlay.depth++;
              if (covered)
                covered.depth++;
            }
            let oldMounts = fragmentCursor.findMounts(cursor.from, nest.parser);
            if (typeof nest.overlay == "function") {
              overlay = new ActiveOverlay(nest.parser, nest.overlay, oldMounts, this.inner.length, cursor.from, !!nest.bracketed, cursor.tree, overlay);
            } else {
              let ranges = punchRanges(this.ranges, nest.overlay || (cursor.from < cursor.to ? [new Range(cursor.from, cursor.to)] : []));
              if (ranges.length)
                checkRanges(ranges);
              if (ranges.length || !nest.overlay)
                this.inner.push(new InnerParse(nest.parser, ranges.length ? nest.parser.startParse(this.input, enterFragments(oldMounts, ranges), ranges) : nest.parser.startParse(""), nest.overlay ? nest.overlay.map((r) => new Range(r.from - cursor.from, r.to - cursor.from)) : null, !!nest.bracketed, cursor.tree, ranges.length ? ranges[0].from : cursor.from));
              if (!nest.overlay)
                enter = false;
              else if (ranges.length)
                covered = { ranges, depth: 0, prev: covered };
            }
          } else if (overlay && (range = overlay.predicate(cursor))) {
            if (range === true)
              range = new Range(cursor.from, cursor.to);
            if (range.from < range.to) {
              let last = overlay.ranges.length - 1;
              if (last >= 0 && overlay.ranges[last].to == range.from)
                overlay.ranges[last] = { from: overlay.ranges[last].from, to: range.to };
              else
                overlay.ranges.push(range);
            }
          }
          if (enter && cursor.firstChild()) {
            if (overlay)
              overlay.depth++;
            if (covered)
              covered.depth++;
          } else {
            for (; ; ) {
              if (cursor.nextSibling())
                break;
              if (!cursor.parent())
                break scan;
              if (overlay && !--overlay.depth) {
                let ranges = punchRanges(this.ranges, overlay.ranges);
                if (ranges.length) {
                  checkRanges(ranges);
                  this.inner.splice(overlay.index, 0, new InnerParse(overlay.parser, overlay.parser.startParse(this.input, enterFragments(overlay.mounts, ranges), ranges), overlay.ranges.map((r) => new Range(r.from - overlay.start, r.to - overlay.start)), overlay.bracketed, overlay.target, ranges[0].from));
                }
                overlay = overlay.prev;
              }
              if (covered && !--covered.depth)
                covered = covered.prev;
            }
          }
        }
      }
    };
    function checkCover(covered, from, to) {
      for (let range of covered) {
        if (range.from >= to)
          break;
        if (range.to > from)
          return range.from <= from && range.to >= to ? 2 : 1;
      }
      return 0;
    }
    function sliceBuf(buf, startI, endI, nodes, positions, off) {
      if (startI < endI) {
        let from = buf.buffer[startI + 1];
        nodes.push(buf.slice(startI, endI, from));
        positions.push(from - off);
      }
    }
    function materialize(cursor) {
      let { node } = cursor, stack = [];
      let buffer = node.context.buffer;
      do {
        stack.push(cursor.index);
        cursor.parent();
      } while (!cursor.tree);
      let base = cursor.tree, i = base.children.indexOf(buffer);
      let buf = base.children[i], b = buf.buffer, newStack = [i];
      function split(startI, endI, type, innerOffset, length, stackPos) {
        let targetI = stack[stackPos];
        let children = [], positions = [];
        sliceBuf(buf, startI, targetI, children, positions, innerOffset);
        let from = b[targetI + 1], to = b[targetI + 2];
        newStack.push(children.length);
        let child = stackPos ? split(targetI + 4, b[targetI + 3], buf.set.types[b[targetI]], from, to - from, stackPos - 1) : node.toTree();
        children.push(child);
        positions.push(from - innerOffset);
        sliceBuf(buf, b[targetI + 3], endI, children, positions, innerOffset);
        return new Tree(type, children, positions, length);
      }
      base.children[i] = split(0, b.length, NodeType.none, 0, buf.length, stack.length - 1);
      for (let index of newStack) {
        let tree = cursor.tree.children[index], pos = cursor.tree.positions[index];
        cursor.yield(new TreeNode(tree, pos + cursor.from, index, cursor._tree));
      }
    }
    var StructureCursor = class {
      constructor(root, offset) {
        this.offset = offset;
        this.done = false;
        this.cursor = root.cursor(exports2.IterMode.IncludeAnonymous | exports2.IterMode.IgnoreMounts);
      }
      // Move to the first node (in pre-order) that starts at or after `pos`.
      moveTo(pos) {
        let { cursor } = this, p = pos - this.offset;
        while (!this.done && cursor.from < p) {
          if (cursor.to >= pos && cursor.enter(p, 1, exports2.IterMode.IgnoreOverlays | exports2.IterMode.ExcludeBuffers)) ;
          else if (cursor.to <= pos) {
            if (!cursor.next(false))
              this.done = true;
          } else {
            break;
          }
        }
      }
      hasNode(cursor) {
        this.moveTo(cursor.from);
        if (!this.done && this.cursor.from + this.offset == cursor.from && this.cursor.tree) {
          for (let tree = this.cursor.tree; ; ) {
            if (tree == cursor.tree)
              return true;
            if (tree.children.length && tree.positions[0] == 0 && tree.children[0] instanceof Tree)
              tree = tree.children[0];
            else
              break;
          }
        }
        return false;
      }
    };
    var FragmentCursor = class {
      constructor(fragments) {
        var _a;
        this.fragments = fragments;
        this.curTo = 0;
        this.fragI = 0;
        if (fragments.length) {
          let first = this.curFrag = fragments[0];
          this.curTo = (_a = first.tree.prop(stoppedInner)) !== null && _a !== void 0 ? _a : first.to;
          this.inner = new StructureCursor(first.tree, -first.offset);
        } else {
          this.curFrag = this.inner = null;
        }
      }
      hasNode(node) {
        while (this.curFrag && node.from >= this.curTo)
          this.nextFrag();
        return this.curFrag && this.curFrag.from <= node.from && this.curTo >= node.to && this.inner.hasNode(node);
      }
      nextFrag() {
        var _a;
        this.fragI++;
        if (this.fragI == this.fragments.length) {
          this.curFrag = this.inner = null;
        } else {
          let frag = this.curFrag = this.fragments[this.fragI];
          this.curTo = (_a = frag.tree.prop(stoppedInner)) !== null && _a !== void 0 ? _a : frag.to;
          this.inner = new StructureCursor(frag.tree, -frag.offset);
        }
      }
      findMounts(pos, parser2) {
        var _a;
        let result = [];
        if (this.inner) {
          this.inner.cursor.moveTo(pos, 1);
          for (let pos2 = this.inner.cursor.node; pos2; pos2 = pos2.parent) {
            let mount = (_a = pos2.tree) === null || _a === void 0 ? void 0 : _a.prop(NodeProp.mounted);
            if (mount && mount.parser == parser2) {
              for (let i = this.fragI; i < this.fragments.length; i++) {
                let frag = this.fragments[i];
                if (frag.from >= pos2.to)
                  break;
                if (frag.tree == this.curFrag.tree)
                  result.push({
                    frag,
                    pos: pos2.from - frag.offset,
                    mount
                  });
              }
            }
          }
        }
        return result;
      }
    };
    function punchRanges(outer, ranges) {
      let copy = null, current = ranges;
      for (let i = 1, j = 0; i < outer.length; i++) {
        let gapFrom = outer[i - 1].to, gapTo = outer[i].from;
        for (; j < current.length; j++) {
          let r = current[j];
          if (r.from >= gapTo)
            break;
          if (r.to <= gapFrom)
            continue;
          if (!copy)
            current = copy = ranges.slice();
          if (r.from < gapFrom) {
            copy[j] = new Range(r.from, gapFrom);
            if (r.to > gapTo)
              copy.splice(j + 1, 0, new Range(gapTo, r.to));
          } else if (r.to > gapTo) {
            copy[j--] = new Range(gapTo, r.to);
          } else {
            copy.splice(j--, 1);
          }
        }
      }
      return current;
    }
    function findCoverChanges(a, b, from, to) {
      let iA = 0, iB = 0, inA = false, inB = false, pos = -1e9;
      let result = [];
      for (; ; ) {
        let nextA = iA == a.length ? 1e9 : inA ? a[iA].to : a[iA].from;
        let nextB = iB == b.length ? 1e9 : inB ? b[iB].to : b[iB].from;
        if (inA != inB) {
          let start = Math.max(pos, from), end = Math.min(nextA, nextB, to);
          if (start < end)
            result.push(new Range(start, end));
        }
        pos = Math.min(nextA, nextB);
        if (pos == 1e9)
          break;
        if (nextA == pos) {
          if (!inA)
            inA = true;
          else {
            inA = false;
            iA++;
          }
        }
        if (nextB == pos) {
          if (!inB)
            inB = true;
          else {
            inB = false;
            iB++;
          }
        }
      }
      return result;
    }
    function enterFragments(mounts, ranges) {
      let result = [];
      for (let { pos, mount, frag } of mounts) {
        let startPos = pos + (mount.overlay ? mount.overlay[0].from : 0), endPos = startPos + mount.tree.length;
        let from = Math.max(frag.from, startPos), to = Math.min(frag.to, endPos);
        if (mount.overlay) {
          let overlay = mount.overlay.map((r) => new Range(r.from + pos, r.to + pos));
          let changes = findCoverChanges(ranges, overlay, from, to);
          for (let i = 0, pos2 = from; ; i++) {
            let last = i == changes.length, end = last ? to : changes[i].from;
            if (end > pos2)
              result.push(new TreeFragment(pos2, end, mount.tree, -startPos, frag.from >= pos2 || frag.openStart, frag.to <= end || frag.openEnd));
            if (last)
              break;
            pos2 = changes[i].to;
          }
        } else {
          result.push(new TreeFragment(from, to, mount.tree, -startPos, frag.from >= startPos || frag.openStart, frag.to <= endPos || frag.openEnd));
        }
      }
      return result;
    }
    exports2.DefaultBufferLength = DefaultBufferLength;
    exports2.MountedTree = MountedTree;
    exports2.NodeProp = NodeProp;
    exports2.NodeSet = NodeSet;
    exports2.NodeType = NodeType;
    exports2.NodeWeakMap = NodeWeakMap;
    exports2.Parser = Parser;
    exports2.Tree = Tree;
    exports2.TreeBuffer = TreeBuffer;
    exports2.TreeCursor = TreeCursor;
    exports2.TreeFragment = TreeFragment;
    exports2.parseMixed = parseMixed;
  }
});

// node_modules/@lezer/lr/dist/index.cjs
var require_dist2 = __commonJS({
  "node_modules/@lezer/lr/dist/index.cjs"(exports2) {
    "use strict";
    var common = require_dist();
    var Stack = class _Stack {
      /**
      @internal
      */
      constructor(p, stack, state, reducePos, pos, score, buffer, bufferBase, curContext, lookAhead = 0, parent) {
        this.p = p;
        this.stack = stack;
        this.state = state;
        this.reducePos = reducePos;
        this.pos = pos;
        this.score = score;
        this.buffer = buffer;
        this.bufferBase = bufferBase;
        this.curContext = curContext;
        this.lookAhead = lookAhead;
        this.parent = parent;
      }
      /**
      @internal
      */
      toString() {
        return `[${this.stack.filter((_, i) => i % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
      }
      // Start an empty stack
      /**
      @internal
      */
      static start(p, state, pos = 0) {
        let cx = p.parser.context;
        return new _Stack(p, [], state, pos, pos, 0, [], 0, cx ? new StackContext(cx, cx.start) : null, 0, null);
      }
      /**
      The stack's current [context](#lr.ContextTracker) value, if
      any. Its type will depend on the context tracker's type
      parameter, or it will be `null` if there is no context
      tracker.
      */
      get context() {
        return this.curContext ? this.curContext.context : null;
      }
      // Push a state onto the stack, tracking its start position as well
      // as the buffer base at that point.
      /**
      @internal
      */
      pushState(state, start) {
        this.stack.push(this.state, start, this.bufferBase + this.buffer.length);
        this.state = state;
      }
      // Apply a reduce action
      /**
      @internal
      */
      reduce(action) {
        var _a;
        let depth = action >> 19, type = action & 65535;
        let { parser: parser2 } = this.p;
        let lookaheadRecord = this.reducePos < this.pos - 25 && this.setLookAhead(this.pos);
        let dPrec = parser2.dynamicPrecedence(type);
        if (dPrec)
          this.score += dPrec;
        if (depth == 0) {
          if (type < parser2.minRepeatTerm && this.reducePos < this.pos)
            this.reducePos = this.pos;
          this.pushState(parser2.getGoto(this.state, type, true), this.reducePos);
          if (type < parser2.minRepeatTerm)
            this.storeNode(type, this.reducePos, this.reducePos, lookaheadRecord ? 8 : 4, true);
          this.reduceContext(type, this.reducePos);
          return;
        }
        let base = this.stack.length - (depth - 1) * 3 - (action & 262144 ? 6 : 0);
        let start = base ? this.stack[base - 2] : this.p.ranges[0].from;
        if (type < parser2.minRepeatTerm && start == this.reducePos && this.reducePos < this.pos)
          this.reducePos = this.pos;
        let size = this.reducePos - start;
        if (size >= 2e3 && !((_a = this.p.parser.nodeSet.types[type]) === null || _a === void 0 ? void 0 : _a.isAnonymous)) {
          if (start == this.p.lastBigReductionStart) {
            this.p.bigReductionCount++;
            this.p.lastBigReductionSize = size;
          } else if (this.p.lastBigReductionSize < size) {
            this.p.bigReductionCount = 1;
            this.p.lastBigReductionStart = start;
            this.p.lastBigReductionSize = size;
          }
        }
        let bufferBase = base ? this.stack[base - 1] : 0, count = this.bufferBase + this.buffer.length - bufferBase;
        if (type < parser2.minRepeatTerm || action & 131072) {
          let pos = parser2.stateFlag(
            this.state,
            1
            /* StateFlag.Skipped */
          ) ? this.pos : this.reducePos;
          this.storeNode(type, start, pos, count + 4, true);
        }
        if (action & 262144) {
          this.state = this.stack[base];
        } else {
          let baseStateID = this.stack[base - 3];
          this.state = parser2.getGoto(baseStateID, type, true);
        }
        while (this.stack.length > base)
          this.stack.pop();
        this.reduceContext(type, start);
      }
      // Shift a value into the buffer
      /**
      @internal
      */
      storeNode(term, start, end, size = 4, mustSink = false) {
        if (term == 0 && (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
          let top = this.buffer.length;
          if (top > 0 && this.buffer[top - 4] == 0 && this.buffer[top - 1] > -1) {
            if (start == end)
              return;
            if (this.buffer[top - 2] >= start) {
              this.buffer[top - 2] = end;
              return;
            }
          }
        }
        if (!mustSink || this.pos == end) {
          this.buffer.push(term, start, end, size);
        } else {
          let index = this.buffer.length;
          if (index > 0 && (this.buffer[index - 4] != 0 || this.buffer[index - 1] < 0)) {
            let mustMove = false;
            for (let scan = index; scan > 0 && this.buffer[scan - 2] > end; scan -= 4) {
              if (this.buffer[scan - 1] >= 0) {
                mustMove = true;
                break;
              }
            }
            if (mustMove)
              while (index > 0 && this.buffer[index - 2] > end) {
                this.buffer[index] = this.buffer[index - 4];
                this.buffer[index + 1] = this.buffer[index - 3];
                this.buffer[index + 2] = this.buffer[index - 2];
                this.buffer[index + 3] = this.buffer[index - 1];
                index -= 4;
                if (size > 4)
                  size -= 4;
              }
          }
          this.buffer[index] = term;
          this.buffer[index + 1] = start;
          this.buffer[index + 2] = end;
          this.buffer[index + 3] = size;
        }
      }
      // Apply a shift action
      /**
      @internal
      */
      shift(action, type, start, end) {
        if (action & 131072) {
          this.pushState(action & 65535, this.pos);
        } else if ((action & 262144) == 0) {
          let nextState = action, { parser: parser2 } = this.p;
          this.pos = end;
          let skipped = parser2.stateFlag(
            nextState,
            1
            /* StateFlag.Skipped */
          );
          if (!skipped && (end > start || type <= parser2.maxNode))
            this.reducePos = end;
          this.pushState(nextState, skipped ? start : Math.min(start, this.reducePos));
          this.shiftContext(type, start);
          if (type <= parser2.maxNode)
            this.buffer.push(type, start, end, 4);
        } else {
          this.pos = end;
          this.shiftContext(type, start);
          if (type <= this.p.parser.maxNode)
            this.buffer.push(type, start, end, 4);
        }
      }
      // Apply an action
      /**
      @internal
      */
      apply(action, next, nextStart, nextEnd) {
        if (action & 65536)
          this.reduce(action);
        else
          this.shift(action, next, nextStart, nextEnd);
      }
      // Add a prebuilt (reused) node into the buffer.
      /**
      @internal
      */
      useNode(value, next) {
        let index = this.p.reused.length - 1;
        if (index < 0 || this.p.reused[index] != value) {
          this.p.reused.push(value);
          index++;
        }
        let start = this.pos;
        this.reducePos = this.pos = start + value.length;
        this.pushState(next, start);
        this.buffer.push(
          index,
          start,
          this.reducePos,
          -1
          /* size == -1 means this is a reused value */
        );
        if (this.curContext)
          this.updateContext(this.curContext.tracker.reuse(this.curContext.context, value, this, this.p.stream.reset(this.pos - value.length)));
      }
      // Split the stack. Due to the buffer sharing and the fact
      // that `this.stack` tends to stay quite shallow, this isn't very
      // expensive.
      /**
      @internal
      */
      split() {
        let parent = this;
        let off = parent.buffer.length;
        if (off && parent.buffer[off - 4] == 0)
          off -= 4;
        while (off > 0 && parent.buffer[off - 2] > parent.reducePos)
          off -= 4;
        let buffer = parent.buffer.slice(off), base = parent.bufferBase + off;
        while (parent && base == parent.bufferBase)
          parent = parent.parent;
        return new _Stack(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, buffer, base, this.curContext, this.lookAhead, parent);
      }
      // Try to recover from an error by 'deleting' (ignoring) one token.
      /**
      @internal
      */
      recoverByDelete(next, nextEnd) {
        let isNode = next <= this.p.parser.maxNode;
        if (isNode)
          this.storeNode(next, this.pos, nextEnd, 4);
        this.storeNode(0, this.pos, nextEnd, isNode ? 8 : 4);
        this.pos = this.reducePos = nextEnd;
        this.score -= 190;
      }
      /**
      Check if the given term would be able to be shifted (optionally
      after some reductions) on this stack. This can be useful for
      external tokenizers that want to make sure they only provide a
      given token when it applies.
      */
      canShift(term) {
        for (let sim = new SimulatedStack(this); ; ) {
          let action = this.p.parser.stateSlot(
            sim.state,
            4
            /* ParseState.DefaultReduce */
          ) || this.p.parser.hasAction(sim.state, term);
          if (action == 0)
            return false;
          if ((action & 65536) == 0)
            return true;
          sim.reduce(action);
        }
      }
      // Apply up to Recover.MaxNext recovery actions that conceptually
      // inserts some missing token or rule.
      /**
      @internal
      */
      recoverByInsert(next) {
        if (this.stack.length >= 300)
          return [];
        let nextStates = this.p.parser.nextStates(this.state);
        if (nextStates.length > 4 << 1 || this.stack.length >= 120) {
          let best = [];
          for (let i = 0, s; i < nextStates.length; i += 2) {
            if ((s = nextStates[i + 1]) != this.state && this.p.parser.hasAction(s, next))
              best.push(nextStates[i], s);
          }
          if (this.stack.length < 120)
            for (let i = 0; best.length < 4 << 1 && i < nextStates.length; i += 2) {
              let s = nextStates[i + 1];
              if (!best.some((v, i2) => i2 & 1 && v == s))
                best.push(nextStates[i], s);
            }
          nextStates = best;
        }
        let result = [];
        for (let i = 0; i < nextStates.length && result.length < 4; i += 2) {
          let s = nextStates[i + 1];
          if (s == this.state)
            continue;
          let stack = this.split();
          stack.pushState(s, this.pos);
          stack.storeNode(0, stack.pos, stack.pos, 4, true);
          stack.shiftContext(nextStates[i], this.pos);
          stack.reducePos = this.pos;
          stack.score -= 200;
          result.push(stack);
        }
        return result;
      }
      // Force a reduce, if possible. Return false if that can't
      // be done.
      /**
      @internal
      */
      forceReduce() {
        let { parser: parser2 } = this.p;
        let reduce = parser2.stateSlot(
          this.state,
          5
          /* ParseState.ForcedReduce */
        );
        if ((reduce & 65536) == 0)
          return false;
        if (!parser2.validAction(this.state, reduce)) {
          let depth = reduce >> 19, term = reduce & 65535;
          let target = this.stack.length - depth * 3;
          if (target < 0 || parser2.getGoto(this.stack[target], term, false) < 0) {
            let backup = this.findForcedReduction();
            if (backup == null)
              return false;
            reduce = backup;
          }
          this.storeNode(0, this.pos, this.pos, 4, true);
          this.score -= 100;
        }
        this.reducePos = this.pos;
        this.reduce(reduce);
        return true;
      }
      /**
      Try to scan through the automaton to find some kind of reduction
      that can be applied. Used when the regular ForcedReduce field
      isn't a valid action. @internal
      */
      findForcedReduction() {
        let { parser: parser2 } = this.p, seen = [];
        let explore = (state, depth) => {
          if (seen.includes(state))
            return;
          seen.push(state);
          return parser2.allActions(state, (action) => {
            if (action & (262144 | 131072)) ;
            else if (action & 65536) {
              let rDepth = (action >> 19) - depth;
              if (rDepth > 1) {
                let term = action & 65535, target = this.stack.length - rDepth * 3;
                if (target >= 0 && parser2.getGoto(this.stack[target], term, false) >= 0)
                  return rDepth << 19 | 65536 | term;
              }
            } else {
              let found = explore(action, depth + 1);
              if (found != null)
                return found;
            }
          });
        };
        return explore(this.state, 0);
      }
      /**
      @internal
      */
      forceAll() {
        while (!this.p.parser.stateFlag(
          this.state,
          2
          /* StateFlag.Accepting */
        )) {
          if (!this.forceReduce()) {
            this.storeNode(0, this.pos, this.pos, 4, true);
            break;
          }
        }
        return this;
      }
      /**
      Check whether this state has no further actions (assumed to be a direct descendant of the
      top state, since any other states must be able to continue
      somehow). @internal
      */
      get deadEnd() {
        if (this.stack.length != 3)
          return false;
        let { parser: parser2 } = this.p;
        return parser2.data[parser2.stateSlot(
          this.state,
          1
          /* ParseState.Actions */
        )] == 65535 && !parser2.stateSlot(
          this.state,
          4
          /* ParseState.DefaultReduce */
        );
      }
      /**
      Restart the stack (put it back in its start state). Only safe
      when this.stack.length == 3 (state is directly below the top
      state). @internal
      */
      restart() {
        this.storeNode(0, this.pos, this.pos, 4, true);
        this.state = this.stack[0];
        this.stack.length = 0;
      }
      /**
      @internal
      */
      sameState(other) {
        if (this.state != other.state || this.stack.length != other.stack.length)
          return false;
        for (let i = 0; i < this.stack.length; i += 3)
          if (this.stack[i] != other.stack[i])
            return false;
        return true;
      }
      /**
      Get the parser used by this stack.
      */
      get parser() {
        return this.p.parser;
      }
      /**
      Test whether a given dialect (by numeric ID, as exported from
      the terms file) is enabled.
      */
      dialectEnabled(dialectID) {
        return this.p.parser.dialect.flags[dialectID];
      }
      shiftContext(term, start) {
        if (this.curContext)
          this.updateContext(this.curContext.tracker.shift(this.curContext.context, term, this, this.p.stream.reset(start)));
      }
      reduceContext(term, start) {
        if (this.curContext)
          this.updateContext(this.curContext.tracker.reduce(this.curContext.context, term, this, this.p.stream.reset(start)));
      }
      /**
      @internal
      */
      emitContext() {
        let last = this.buffer.length - 1;
        if (last < 0 || this.buffer[last] != -3)
          this.buffer.push(this.curContext.hash, this.pos, this.pos, -3);
      }
      /**
      @internal
      */
      emitLookAhead() {
        let last = this.buffer.length - 1;
        if (last < 0 || this.buffer[last] != -4)
          this.buffer.push(this.lookAhead, this.pos, this.pos, -4);
      }
      updateContext(context) {
        if (context != this.curContext.context) {
          let newCx = new StackContext(this.curContext.tracker, context);
          if (newCx.hash != this.curContext.hash)
            this.emitContext();
          this.curContext = newCx;
        }
      }
      /**
      @internal
      */
      setLookAhead(lookAhead) {
        if (lookAhead <= this.lookAhead)
          return false;
        this.emitLookAhead();
        this.lookAhead = lookAhead;
        return true;
      }
      /**
      @internal
      */
      close() {
        if (this.curContext && this.curContext.tracker.strict)
          this.emitContext();
        if (this.lookAhead > 0)
          this.emitLookAhead();
      }
    };
    var StackContext = class {
      constructor(tracker, context) {
        this.tracker = tracker;
        this.context = context;
        this.hash = tracker.strict ? tracker.hash(context) : 0;
      }
    };
    var SimulatedStack = class {
      constructor(start) {
        this.start = start;
        this.state = start.state;
        this.stack = start.stack;
        this.base = this.stack.length;
      }
      reduce(action) {
        let term = action & 65535, depth = action >> 19;
        if (depth == 0) {
          if (this.stack == this.start.stack)
            this.stack = this.stack.slice();
          this.stack.push(this.state, 0, 0);
          this.base += 3;
        } else {
          this.base -= (depth - 1) * 3;
        }
        let goto = this.start.p.parser.getGoto(this.stack[this.base - 3], term, true);
        this.state = goto;
      }
    };
    var StackBufferCursor = class _StackBufferCursor {
      constructor(stack, pos, index) {
        this.stack = stack;
        this.pos = pos;
        this.index = index;
        this.buffer = stack.buffer;
        if (this.index == 0)
          this.maybeNext();
      }
      static create(stack, pos = stack.bufferBase + stack.buffer.length) {
        return new _StackBufferCursor(stack, pos, pos - stack.bufferBase);
      }
      maybeNext() {
        let next = this.stack.parent;
        if (next != null) {
          this.index = this.stack.bufferBase - next.bufferBase;
          this.stack = next;
          this.buffer = next.buffer;
        }
      }
      get id() {
        return this.buffer[this.index - 4];
      }
      get start() {
        return this.buffer[this.index - 3];
      }
      get end() {
        return this.buffer[this.index - 2];
      }
      get size() {
        return this.buffer[this.index - 1];
      }
      next() {
        this.index -= 4;
        this.pos -= 4;
        if (this.index == 0)
          this.maybeNext();
      }
      fork() {
        return new _StackBufferCursor(this.stack, this.pos, this.index);
      }
    };
    function decodeArray(input, Type = Uint16Array) {
      if (typeof input != "string")
        return input;
      let array = null;
      for (let pos = 0, out = 0; pos < input.length; ) {
        let value = 0;
        for (; ; ) {
          let next = input.charCodeAt(pos++), stop = false;
          if (next == 126) {
            value = 65535;
            break;
          }
          if (next >= 92)
            next--;
          if (next >= 34)
            next--;
          let digit = next - 32;
          if (digit >= 46) {
            digit -= 46;
            stop = true;
          }
          value += digit;
          if (stop)
            break;
          value *= 46;
        }
        if (array)
          array[out++] = value;
        else
          array = new Type(value);
      }
      return array;
    }
    var CachedToken = class {
      constructor() {
        this.start = -1;
        this.value = -1;
        this.end = -1;
        this.extended = -1;
        this.lookAhead = 0;
        this.mask = 0;
        this.context = 0;
      }
    };
    var nullToken = new CachedToken();
    var InputStream = class {
      /**
      @internal
      */
      constructor(input, ranges) {
        this.input = input;
        this.ranges = ranges;
        this.chunk = "";
        this.chunkOff = 0;
        this.chunk2 = "";
        this.chunk2Pos = 0;
        this.next = -1;
        this.token = nullToken;
        this.rangeIndex = 0;
        this.pos = this.chunkPos = ranges[0].from;
        this.range = ranges[0];
        this.end = ranges[ranges.length - 1].to;
        this.readNext();
      }
      /**
      @internal
      */
      resolveOffset(offset, assoc) {
        let range = this.range, index = this.rangeIndex;
        let pos = this.pos + offset;
        while (pos < range.from) {
          if (!index)
            return null;
          let next = this.ranges[--index];
          pos -= range.from - next.to;
          range = next;
        }
        while (assoc < 0 ? pos > range.to : pos >= range.to) {
          if (index == this.ranges.length - 1)
            return null;
          let next = this.ranges[++index];
          pos += next.from - range.to;
          range = next;
        }
        return pos;
      }
      /**
      @internal
      */
      clipPos(pos) {
        if (pos >= this.range.from && pos < this.range.to)
          return pos;
        for (let range of this.ranges)
          if (range.to > pos)
            return Math.max(pos, range.from);
        return this.end;
      }
      /**
      Look at a code unit near the stream position. `.peek(0)` equals
      `.next`, `.peek(-1)` gives you the previous character, and so
      on.
      
      Note that looking around during tokenizing creates dependencies
      on potentially far-away content, which may reduce the
      effectiveness incremental parsing—when looking forward—or even
      cause invalid reparses when looking backward more than 25 code
      units, since the library does not track lookbehind.
      */
      peek(offset) {
        let idx = this.chunkOff + offset, pos, result;
        if (idx >= 0 && idx < this.chunk.length) {
          pos = this.pos + offset;
          result = this.chunk.charCodeAt(idx);
        } else {
          let resolved = this.resolveOffset(offset, 1);
          if (resolved == null)
            return -1;
          pos = resolved;
          if (pos >= this.chunk2Pos && pos < this.chunk2Pos + this.chunk2.length) {
            result = this.chunk2.charCodeAt(pos - this.chunk2Pos);
          } else {
            let i = this.rangeIndex, range = this.range;
            while (range.to <= pos)
              range = this.ranges[++i];
            this.chunk2 = this.input.chunk(this.chunk2Pos = pos);
            if (pos + this.chunk2.length > range.to)
              this.chunk2 = this.chunk2.slice(0, range.to - pos);
            result = this.chunk2.charCodeAt(0);
          }
        }
        if (pos >= this.token.lookAhead)
          this.token.lookAhead = pos + 1;
        return result;
      }
      /**
      Accept a token. By default, the end of the token is set to the
      current stream position, but you can pass an offset (relative to
      the stream position) to change that.
      */
      acceptToken(token, endOffset = 0) {
        let end = endOffset ? this.resolveOffset(endOffset, -1) : this.pos;
        if (end == null || end < this.token.start)
          throw new RangeError("Token end out of bounds");
        this.token.value = token;
        this.token.end = end;
      }
      /**
      Accept a token ending at a specific given position.
      */
      acceptTokenTo(token, endPos) {
        this.token.value = token;
        this.token.end = endPos;
      }
      getChunk() {
        if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
          let { chunk, chunkPos } = this;
          this.chunk = this.chunk2;
          this.chunkPos = this.chunk2Pos;
          this.chunk2 = chunk;
          this.chunk2Pos = chunkPos;
          this.chunkOff = this.pos - this.chunkPos;
        } else {
          this.chunk2 = this.chunk;
          this.chunk2Pos = this.chunkPos;
          let nextChunk = this.input.chunk(this.pos);
          let end = this.pos + nextChunk.length;
          this.chunk = end > this.range.to ? nextChunk.slice(0, this.range.to - this.pos) : nextChunk;
          this.chunkPos = this.pos;
          this.chunkOff = 0;
        }
      }
      readNext() {
        if (this.chunkOff >= this.chunk.length) {
          this.getChunk();
          if (this.chunkOff == this.chunk.length)
            return this.next = -1;
        }
        return this.next = this.chunk.charCodeAt(this.chunkOff);
      }
      /**
      Move the stream forward N (defaults to 1) code units. Returns
      the new value of [`next`](#lr.InputStream.next).
      */
      advance(n = 1) {
        this.chunkOff += n;
        while (this.pos + n >= this.range.to) {
          if (this.rangeIndex == this.ranges.length - 1)
            return this.setDone();
          n -= this.range.to - this.pos;
          this.range = this.ranges[++this.rangeIndex];
          this.pos = this.range.from;
        }
        this.pos += n;
        if (this.pos >= this.token.lookAhead)
          this.token.lookAhead = this.pos + 1;
        return this.readNext();
      }
      setDone() {
        this.pos = this.chunkPos = this.end;
        this.range = this.ranges[this.rangeIndex = this.ranges.length - 1];
        this.chunk = "";
        return this.next = -1;
      }
      /**
      @internal
      */
      reset(pos, token) {
        if (token) {
          this.token = token;
          token.start = pos;
          token.lookAhead = pos + 1;
          token.value = token.extended = -1;
        } else {
          this.token = nullToken;
        }
        if (this.pos != pos) {
          this.pos = pos;
          if (pos == this.end) {
            this.setDone();
            return this;
          }
          while (pos < this.range.from)
            this.range = this.ranges[--this.rangeIndex];
          while (pos >= this.range.to)
            this.range = this.ranges[++this.rangeIndex];
          if (pos >= this.chunkPos && pos < this.chunkPos + this.chunk.length) {
            this.chunkOff = pos - this.chunkPos;
          } else {
            this.chunk = "";
            this.chunkOff = 0;
          }
          this.readNext();
        }
        return this;
      }
      /**
      @internal
      */
      read(from, to) {
        if (from >= this.chunkPos && to <= this.chunkPos + this.chunk.length)
          return this.chunk.slice(from - this.chunkPos, to - this.chunkPos);
        if (from >= this.chunk2Pos && to <= this.chunk2Pos + this.chunk2.length)
          return this.chunk2.slice(from - this.chunk2Pos, to - this.chunk2Pos);
        if (from >= this.range.from && to <= this.range.to)
          return this.input.read(from, to);
        let result = "";
        for (let r of this.ranges) {
          if (r.from >= to)
            break;
          if (r.to > from)
            result += this.input.read(Math.max(r.from, from), Math.min(r.to, to));
        }
        return result;
      }
    };
    var TokenGroup = class {
      constructor(data, id2) {
        this.data = data;
        this.id = id2;
      }
      token(input, stack) {
        let { parser: parser2 } = stack.p;
        readToken(this.data, input, stack, this.id, parser2.data, parser2.tokenPrecTable);
      }
    };
    TokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
    var LocalTokenGroup = class {
      constructor(data, precTable, elseToken) {
        this.precTable = precTable;
        this.elseToken = elseToken;
        this.data = typeof data == "string" ? decodeArray(data) : data;
      }
      token(input, stack) {
        let start = input.pos, skipped = 0;
        for (; ; ) {
          let atEof = input.next < 0, nextPos = input.resolveOffset(1, 1);
          readToken(this.data, input, stack, 0, this.data, this.precTable);
          if (input.token.value > -1)
            break;
          if (this.elseToken == null)
            return;
          if (!atEof)
            skipped++;
          if (nextPos == null)
            break;
          input.reset(nextPos, input.token);
        }
        if (skipped) {
          input.reset(start, input.token);
          input.acceptToken(this.elseToken, skipped);
        }
      }
    };
    LocalTokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
    var ExternalTokenizer2 = class {
      /**
      Create a tokenizer. The first argument is the function that,
      given an input stream, scans for the types of tokens it
      recognizes at the stream's position, and calls
      [`acceptToken`](#lr.InputStream.acceptToken) when it finds
      one.
      */
      constructor(token, options = {}) {
        this.token = token;
        this.contextual = !!options.contextual;
        this.fallback = !!options.fallback;
        this.extend = !!options.extend;
      }
    };
    function readToken(data, input, stack, group, precTable, precOffset) {
      let state = 0, groupMask = 1 << group, { dialect } = stack.p.parser;
      scan: for (; ; ) {
        if ((groupMask & data[state]) == 0)
          break;
        let accEnd = data[state + 1];
        for (let i = state + 3; i < accEnd; i += 2)
          if ((data[i + 1] & groupMask) > 0) {
            let term = data[i];
            if (dialect.allows(term) && (input.token.value == -1 || input.token.value == term || overrides(term, input.token.value, precTable, precOffset))) {
              input.acceptToken(term);
              break;
            }
          }
        let next = input.next, low = 0, high = data[state + 2];
        if (input.next < 0 && high > low && data[accEnd + high * 3 - 3] == 65535) {
          state = data[accEnd + high * 3 - 1];
          continue scan;
        }
        for (; low < high; ) {
          let mid = low + high >> 1;
          let index = accEnd + mid + (mid << 1);
          let from = data[index], to = data[index + 1] || 65536;
          if (next < from)
            high = mid;
          else if (next >= to)
            low = mid + 1;
          else {
            state = data[index + 2];
            input.advance();
            continue scan;
          }
        }
        break;
      }
    }
    function findOffset(data, start, term) {
      for (let i = start, next; (next = data[i]) != 65535; i++)
        if (next == term)
          return i - start;
      return -1;
    }
    function overrides(token, prev, tableData, tableOffset) {
      let iPrev = findOffset(tableData, tableOffset, prev);
      return iPrev < 0 || findOffset(tableData, tableOffset, token) < iPrev;
    }
    var verbose = typeof process != "undefined" && process.env && /\bparse\b/.test(process.env.LOG);
    var stackIDs = null;
    function cutAt(tree, pos, side) {
      let cursor = tree.cursor(common.IterMode.IncludeAnonymous);
      cursor.moveTo(pos);
      for (; ; ) {
        if (!(side < 0 ? cursor.childBefore(pos) : cursor.childAfter(pos)))
          for (; ; ) {
            if ((side < 0 ? cursor.to < pos : cursor.from > pos) && !cursor.type.isError)
              return side < 0 ? Math.max(0, Math.min(
                cursor.to - 1,
                pos - 25
                /* Lookahead.Margin */
              )) : Math.min(tree.length, Math.max(
                cursor.from + 1,
                pos + 25
                /* Lookahead.Margin */
              ));
            if (side < 0 ? cursor.prevSibling() : cursor.nextSibling())
              break;
            if (!cursor.parent())
              return side < 0 ? 0 : tree.length;
          }
      }
    }
    var FragmentCursor = class {
      constructor(fragments, nodeSet) {
        this.fragments = fragments;
        this.nodeSet = nodeSet;
        this.i = 0;
        this.fragment = null;
        this.safeFrom = -1;
        this.safeTo = -1;
        this.trees = [];
        this.start = [];
        this.index = [];
        this.nextFragment();
      }
      nextFragment() {
        let fr = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
        if (fr) {
          this.safeFrom = fr.openStart ? cutAt(fr.tree, fr.from + fr.offset, 1) - fr.offset : fr.from;
          this.safeTo = fr.openEnd ? cutAt(fr.tree, fr.to + fr.offset, -1) - fr.offset : fr.to;
          while (this.trees.length) {
            this.trees.pop();
            this.start.pop();
            this.index.pop();
          }
          this.trees.push(fr.tree);
          this.start.push(-fr.offset);
          this.index.push(0);
          this.nextStart = this.safeFrom;
        } else {
          this.nextStart = 1e9;
        }
      }
      // `pos` must be >= any previously given `pos` for this cursor
      nodeAt(pos) {
        if (pos < this.nextStart)
          return null;
        while (this.fragment && this.safeTo <= pos)
          this.nextFragment();
        if (!this.fragment)
          return null;
        for (; ; ) {
          let last = this.trees.length - 1;
          if (last < 0) {
            this.nextFragment();
            return null;
          }
          let top = this.trees[last], index = this.index[last];
          if (index == top.children.length) {
            this.trees.pop();
            this.start.pop();
            this.index.pop();
            continue;
          }
          let next = top.children[index];
          let start = this.start[last] + top.positions[index];
          if (start > pos) {
            this.nextStart = start;
            return null;
          }
          if (next instanceof common.Tree) {
            if (start == pos) {
              if (start < this.safeFrom)
                return null;
              let end = start + next.length;
              if (end <= this.safeTo) {
                let lookAhead = next.prop(common.NodeProp.lookAhead);
                if (!lookAhead || end + lookAhead < this.fragment.to)
                  return next;
              }
            }
            this.index[last]++;
            if (start + next.length >= Math.max(this.safeFrom, pos)) {
              this.trees.push(next);
              this.start.push(start);
              this.index.push(0);
            }
          } else {
            this.index[last]++;
            this.nextStart = start + next.length;
          }
        }
      }
    };
    var TokenCache = class {
      constructor(parser2, stream) {
        this.stream = stream;
        this.tokens = [];
        this.mainToken = null;
        this.actions = [];
        this.tokens = parser2.tokenizers.map((_) => new CachedToken());
      }
      getActions(stack) {
        let actionIndex = 0;
        let main = null;
        let { parser: parser2 } = stack.p, { tokenizers } = parser2;
        let mask = parser2.stateSlot(
          stack.state,
          3
          /* ParseState.TokenizerMask */
        );
        let context = stack.curContext ? stack.curContext.hash : 0;
        let lookAhead = 0;
        for (let i = 0; i < tokenizers.length; i++) {
          if ((1 << i & mask) == 0)
            continue;
          let tokenizer = tokenizers[i], token = this.tokens[i];
          if (main && !tokenizer.fallback)
            continue;
          if (tokenizer.contextual || token.start != stack.pos || token.mask != mask || token.context != context) {
            this.updateCachedToken(token, tokenizer, stack);
            token.mask = mask;
            token.context = context;
          }
          if (token.lookAhead > token.end + 25)
            lookAhead = Math.max(token.lookAhead, lookAhead);
          if (token.value != 0) {
            let startIndex = actionIndex;
            if (token.extended > -1)
              actionIndex = this.addActions(stack, token.extended, token.end, actionIndex);
            actionIndex = this.addActions(stack, token.value, token.end, actionIndex);
            if (!tokenizer.extend) {
              main = token;
              if (actionIndex > startIndex)
                break;
            }
          }
        }
        while (this.actions.length > actionIndex)
          this.actions.pop();
        if (lookAhead)
          stack.setLookAhead(lookAhead);
        if (!main && stack.pos == this.stream.end) {
          main = new CachedToken();
          main.value = stack.p.parser.eofTerm;
          main.start = main.end = stack.pos;
          actionIndex = this.addActions(stack, main.value, main.end, actionIndex);
        }
        this.mainToken = main;
        return this.actions;
      }
      getMainToken(stack) {
        if (this.mainToken)
          return this.mainToken;
        let main = new CachedToken(), { pos, p } = stack;
        main.start = pos;
        main.end = Math.min(pos + 1, p.stream.end);
        main.value = pos == p.stream.end ? p.parser.eofTerm : 0;
        return main;
      }
      updateCachedToken(token, tokenizer, stack) {
        let start = this.stream.clipPos(stack.pos);
        tokenizer.token(this.stream.reset(start, token), stack);
        if (token.value > -1) {
          let { parser: parser2 } = stack.p;
          for (let i = 0; i < parser2.specialized.length; i++)
            if (parser2.specialized[i] == token.value) {
              let result = parser2.specializers[i](this.stream.read(token.start, token.end), stack);
              if (result >= 0 && stack.p.parser.dialect.allows(result >> 1)) {
                if ((result & 1) == 0)
                  token.value = result >> 1;
                else
                  token.extended = result >> 1;
                break;
              }
            }
        } else {
          token.value = 0;
          token.end = this.stream.clipPos(start + 1);
        }
      }
      putAction(action, token, end, index) {
        for (let i = 0; i < index; i += 3)
          if (this.actions[i] == action)
            return index;
        this.actions[index++] = action;
        this.actions[index++] = token;
        this.actions[index++] = end;
        return index;
      }
      addActions(stack, token, end, index) {
        let { state } = stack, { parser: parser2 } = stack.p, { data } = parser2;
        for (let set = 0; set < 2; set++) {
          for (let i = parser2.stateSlot(
            state,
            set ? 2 : 1
            /* ParseState.Actions */
          ); ; i += 3) {
            if (data[i] == 65535) {
              if (data[i + 1] == 1) {
                i = pair(data, i + 2);
              } else {
                if (index == 0 && data[i + 1] == 2)
                  index = this.putAction(pair(data, i + 2), token, end, index);
                break;
              }
            }
            if (data[i] == token)
              index = this.putAction(pair(data, i + 1), token, end, index);
          }
        }
        return index;
      }
    };
    var Parse = class {
      constructor(parser2, input, fragments, ranges) {
        this.parser = parser2;
        this.input = input;
        this.ranges = ranges;
        this.recovering = 0;
        this.nextStackID = 9812;
        this.minStackPos = 0;
        this.reused = [];
        this.stoppedAt = null;
        this.lastBigReductionStart = -1;
        this.lastBigReductionSize = 0;
        this.bigReductionCount = 0;
        this.stream = new InputStream(input, ranges);
        this.tokens = new TokenCache(parser2, this.stream);
        this.topTerm = parser2.top[1];
        let { from } = ranges[0];
        this.stacks = [Stack.start(this, parser2.top[0], from)];
        this.fragments = fragments.length && this.stream.end - from > parser2.bufferLength * 4 ? new FragmentCursor(fragments, parser2.nodeSet) : null;
      }
      get parsedPos() {
        return this.minStackPos;
      }
      // Move the parser forward. This will process all parse stacks at
      // `this.pos` and try to advance them to a further position. If no
      // stack for such a position is found, it'll start error-recovery.
      //
      // When the parse is finished, this will return a syntax tree. When
      // not, it returns `null`.
      advance() {
        let stacks = this.stacks, pos = this.minStackPos;
        let newStacks = this.stacks = [];
        let stopped, stoppedTokens;
        if (this.bigReductionCount > 300 && stacks.length == 1) {
          let [s] = stacks;
          while (s.forceReduce() && s.stack.length && s.stack[s.stack.length - 2] >= this.lastBigReductionStart) {
          }
          this.bigReductionCount = this.lastBigReductionSize = 0;
        }
        for (let i = 0; i < stacks.length; i++) {
          let stack = stacks[i];
          for (; ; ) {
            this.tokens.mainToken = null;
            if (stack.pos > pos) {
              newStacks.push(stack);
            } else if (this.advanceStack(stack, newStacks, stacks)) {
              continue;
            } else {
              if (!stopped) {
                stopped = [];
                stoppedTokens = [];
              }
              stopped.push(stack);
              let tok = this.tokens.getMainToken(stack);
              stoppedTokens.push(tok.value, tok.end);
            }
            break;
          }
        }
        if (!newStacks.length) {
          let finished = stopped && findFinished(stopped);
          if (finished) {
            if (verbose)
              console.log("Finish with " + this.stackID(finished));
            return this.stackToTree(finished);
          }
          if (this.parser.strict) {
            if (verbose && stopped)
              console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none"));
            throw new SyntaxError("No parse at " + pos);
          }
          if (!this.recovering)
            this.recovering = 5;
        }
        if (this.recovering && stopped) {
          let finished = this.stoppedAt != null && stopped[0].pos > this.stoppedAt ? stopped[0] : this.runRecovery(stopped, stoppedTokens, newStacks);
          if (finished) {
            if (verbose)
              console.log("Force-finish " + this.stackID(finished));
            return this.stackToTree(finished.forceAll());
          }
        }
        if (this.recovering) {
          let maxRemaining = this.recovering == 1 ? 1 : this.recovering * 3;
          if (newStacks.length > maxRemaining) {
            newStacks.sort((a, b) => b.score - a.score);
            while (newStacks.length > maxRemaining)
              newStacks.pop();
          }
          if (newStacks.some((s) => s.reducePos > pos))
            this.recovering--;
        } else if (newStacks.length > 1) {
          outer: for (let i = 0; i < newStacks.length - 1; i++) {
            let stack = newStacks[i];
            for (let j = i + 1; j < newStacks.length; j++) {
              let other = newStacks[j];
              if (stack.sameState(other) || stack.buffer.length > 500 && other.buffer.length > 500) {
                if ((stack.score - other.score || stack.buffer.length - other.buffer.length) > 0) {
                  newStacks.splice(j--, 1);
                } else {
                  newStacks.splice(i--, 1);
                  continue outer;
                }
              }
            }
          }
          if (newStacks.length > 12) {
            newStacks.sort((a, b) => b.score - a.score);
            newStacks.splice(
              12,
              newStacks.length - 12
              /* Rec.MaxStackCount */
            );
          }
        }
        this.minStackPos = newStacks[0].pos;
        for (let i = 1; i < newStacks.length; i++)
          if (newStacks[i].pos < this.minStackPos)
            this.minStackPos = newStacks[i].pos;
        return null;
      }
      stopAt(pos) {
        if (this.stoppedAt != null && this.stoppedAt < pos)
          throw new RangeError("Can't move stoppedAt forward");
        this.stoppedAt = pos;
      }
      // Returns an updated version of the given stack, or null if the
      // stack can't advance normally. When `split` and `stacks` are
      // given, stacks split off by ambiguous operations will be pushed to
      // `split`, or added to `stacks` if they move `pos` forward.
      advanceStack(stack, stacks, split) {
        let start = stack.pos, { parser: parser2 } = this;
        let base = verbose ? this.stackID(stack) + " -> " : "";
        if (this.stoppedAt != null && start > this.stoppedAt)
          return stack.forceReduce() ? stack : null;
        if (this.fragments) {
          let strictCx = stack.curContext && stack.curContext.tracker.strict, cxHash = strictCx ? stack.curContext.hash : 0;
          for (let cached = this.fragments.nodeAt(start); cached; ) {
            let match = this.parser.nodeSet.types[cached.type.id] == cached.type ? parser2.getGoto(stack.state, cached.type.id) : -1;
            if (match > -1 && cached.length && (!strictCx || (cached.prop(common.NodeProp.contextHash) || 0) == cxHash)) {
              stack.useNode(cached, match);
              if (verbose)
                console.log(base + this.stackID(stack) + ` (via reuse of ${parser2.getName(cached.type.id)})`);
              return true;
            }
            if (!(cached instanceof common.Tree) || cached.children.length == 0 || cached.positions[0] > 0)
              break;
            let inner = cached.children[0];
            if (inner instanceof common.Tree && cached.positions[0] == 0)
              cached = inner;
            else
              break;
          }
        }
        let defaultReduce = parser2.stateSlot(
          stack.state,
          4
          /* ParseState.DefaultReduce */
        );
        if (defaultReduce > 0) {
          stack.reduce(defaultReduce);
          if (verbose)
            console.log(base + this.stackID(stack) + ` (via always-reduce ${parser2.getName(
              defaultReduce & 65535
              /* Action.ValueMask */
            )})`);
          return true;
        }
        if (stack.stack.length >= 8400) {
          while (stack.stack.length > 6e3 && stack.forceReduce()) {
          }
        }
        let actions = this.tokens.getActions(stack);
        for (let i = 0; i < actions.length; ) {
          let action = actions[i++], term = actions[i++], end = actions[i++];
          let last = i == actions.length || !split;
          let localStack = last ? stack : stack.split();
          let main = this.tokens.mainToken;
          localStack.apply(action, term, main ? main.start : localStack.pos, end);
          if (verbose)
            console.log(base + this.stackID(localStack) + ` (via ${(action & 65536) == 0 ? "shift" : `reduce of ${parser2.getName(
              action & 65535
              /* Action.ValueMask */
            )}`} for ${parser2.getName(term)} @ ${start}${localStack == stack ? "" : ", split"})`);
          if (last)
            return true;
          else if (localStack.pos > start)
            stacks.push(localStack);
          else
            split.push(localStack);
        }
        return false;
      }
      // Advance a given stack forward as far as it will go. Returns the
      // (possibly updated) stack if it got stuck, or null if it moved
      // forward and was given to `pushStackDedup`.
      advanceFully(stack, newStacks) {
        let pos = stack.pos;
        for (; ; ) {
          if (!this.advanceStack(stack, null, null))
            return false;
          if (stack.pos > pos) {
            pushStackDedup(stack, newStacks);
            return true;
          }
        }
      }
      runRecovery(stacks, tokens, newStacks) {
        let finished = null, restarted = false;
        for (let i = 0; i < stacks.length; i++) {
          let stack = stacks[i], token = tokens[i << 1], tokenEnd = tokens[(i << 1) + 1];
          let base = verbose ? this.stackID(stack) + " -> " : "";
          if (stack.deadEnd) {
            if (restarted)
              continue;
            restarted = true;
            stack.restart();
            if (verbose)
              console.log(base + this.stackID(stack) + " (restarted)");
            let done = this.advanceFully(stack, newStacks);
            if (done)
              continue;
          }
          let force = stack.split(), forceBase = base;
          for (let j = 0; j < 10 && force.forceReduce(); j++) {
            if (verbose)
              console.log(forceBase + this.stackID(force) + " (via force-reduce)");
            let done = this.advanceFully(force, newStacks);
            if (done)
              break;
            if (verbose)
              forceBase = this.stackID(force) + " -> ";
          }
          for (let insert of stack.recoverByInsert(token)) {
            if (verbose)
              console.log(base + this.stackID(insert) + " (via recover-insert)");
            this.advanceFully(insert, newStacks);
          }
          if (this.stream.end > stack.pos) {
            if (tokenEnd == stack.pos) {
              tokenEnd++;
              token = 0;
            }
            stack.recoverByDelete(token, tokenEnd);
            if (verbose)
              console.log(base + this.stackID(stack) + ` (via recover-delete ${this.parser.getName(token)})`);
            pushStackDedup(stack, newStacks);
          } else if (!finished || finished.score < force.score) {
            finished = force;
          }
        }
        return finished;
      }
      // Convert the stack's buffer to a syntax tree.
      stackToTree(stack) {
        stack.close();
        return common.Tree.build({
          buffer: StackBufferCursor.create(stack),
          nodeSet: this.parser.nodeSet,
          topID: this.topTerm,
          maxBufferLength: this.parser.bufferLength,
          reused: this.reused,
          start: this.ranges[0].from,
          length: stack.pos - this.ranges[0].from,
          minRepeatType: this.parser.minRepeatTerm
        });
      }
      stackID(stack) {
        let id2 = (stackIDs || (stackIDs = /* @__PURE__ */ new WeakMap())).get(stack);
        if (!id2)
          stackIDs.set(stack, id2 = String.fromCodePoint(this.nextStackID++));
        return id2 + stack;
      }
    };
    function pushStackDedup(stack, newStacks) {
      for (let i = 0; i < newStacks.length; i++) {
        let other = newStacks[i];
        if (other.pos == stack.pos && other.sameState(stack)) {
          if (newStacks[i].score < stack.score)
            newStacks[i] = stack;
          return;
        }
      }
      newStacks.push(stack);
    }
    var Dialect = class {
      constructor(source, flags, disabled) {
        this.source = source;
        this.flags = flags;
        this.disabled = disabled;
      }
      allows(term) {
        return !this.disabled || this.disabled[term] == 0;
      }
    };
    var id = (x) => x;
    var ContextTracker = class {
      /**
      Define a context tracker.
      */
      constructor(spec) {
        this.start = spec.start;
        this.shift = spec.shift || id;
        this.reduce = spec.reduce || id;
        this.reuse = spec.reuse || id;
        this.hash = spec.hash || (() => 0);
        this.strict = spec.strict !== false;
      }
    };
    var LRParser = class _LRParser extends common.Parser {
      /**
      @internal
      */
      constructor(spec) {
        super();
        this.wrappers = [];
        if (spec.version != 14)
          throw new RangeError(`Parser version (${spec.version}) doesn't match runtime version (${14})`);
        let nodeNames = spec.nodeNames.split(" ");
        this.minRepeatTerm = nodeNames.length;
        for (let i = 0; i < spec.repeatNodeCount; i++)
          nodeNames.push("");
        let topTerms = Object.keys(spec.topRules).map((r) => spec.topRules[r][1]);
        let nodeProps = [];
        for (let i = 0; i < nodeNames.length; i++)
          nodeProps.push([]);
        function setProp(nodeID, prop, value) {
          nodeProps[nodeID].push([prop, prop.deserialize(String(value))]);
        }
        if (spec.nodeProps)
          for (let propSpec of spec.nodeProps) {
            let prop = propSpec[0];
            if (typeof prop == "string")
              prop = common.NodeProp[prop];
            for (let i = 1; i < propSpec.length; ) {
              let next = propSpec[i++];
              if (next >= 0) {
                setProp(next, prop, propSpec[i++]);
              } else {
                let value = propSpec[i + -next];
                for (let j = -next; j > 0; j--)
                  setProp(propSpec[i++], prop, value);
                i++;
              }
            }
          }
        this.nodeSet = new common.NodeSet(nodeNames.map((name, i) => common.NodeType.define({
          name: i >= this.minRepeatTerm ? void 0 : name,
          id: i,
          props: nodeProps[i],
          top: topTerms.indexOf(i) > -1,
          error: i == 0,
          skipped: spec.skippedNodes && spec.skippedNodes.indexOf(i) > -1
        })));
        if (spec.propSources)
          this.nodeSet = this.nodeSet.extend(...spec.propSources);
        this.strict = false;
        this.bufferLength = common.DefaultBufferLength;
        let tokenArray = decodeArray(spec.tokenData);
        this.context = spec.context;
        this.specializerSpecs = spec.specialized || [];
        this.specialized = new Uint16Array(this.specializerSpecs.length);
        for (let i = 0; i < this.specializerSpecs.length; i++)
          this.specialized[i] = this.specializerSpecs[i].term;
        this.specializers = this.specializerSpecs.map(getSpecializer);
        this.states = decodeArray(spec.states, Uint32Array);
        this.data = decodeArray(spec.stateData);
        this.goto = decodeArray(spec.goto);
        this.maxTerm = spec.maxTerm;
        this.tokenizers = spec.tokenizers.map((value) => typeof value == "number" ? new TokenGroup(tokenArray, value) : value);
        this.topRules = spec.topRules;
        this.dialects = spec.dialects || {};
        this.dynamicPrecedences = spec.dynamicPrecedences || null;
        this.tokenPrecTable = spec.tokenPrec;
        this.termNames = spec.termNames || null;
        this.maxNode = this.nodeSet.types.length - 1;
        this.dialect = this.parseDialect();
        this.top = this.topRules[Object.keys(this.topRules)[0]];
      }
      createParse(input, fragments, ranges) {
        let parse = new Parse(this, input, fragments, ranges);
        for (let w of this.wrappers)
          parse = w(parse, input, fragments, ranges);
        return parse;
      }
      /**
      Get a goto table entry @internal
      */
      getGoto(state, term, loose = false) {
        let table = this.goto;
        if (term >= table[0])
          return -1;
        for (let pos = table[term + 1]; ; ) {
          let groupTag = table[pos++], last = groupTag & 1;
          let target = table[pos++];
          if (last && loose)
            return target;
          for (let end = pos + (groupTag >> 1); pos < end; pos++)
            if (table[pos] == state)
              return target;
          if (last)
            return -1;
        }
      }
      /**
      Check if this state has an action for a given terminal @internal
      */
      hasAction(state, terminal) {
        let data = this.data;
        for (let set = 0; set < 2; set++) {
          for (let i = this.stateSlot(
            state,
            set ? 2 : 1
            /* ParseState.Actions */
          ), next; ; i += 3) {
            if ((next = data[i]) == 65535) {
              if (data[i + 1] == 1)
                next = data[i = pair(data, i + 2)];
              else if (data[i + 1] == 2)
                return pair(data, i + 2);
              else
                break;
            }
            if (next == terminal || next == 0)
              return pair(data, i + 1);
          }
        }
        return 0;
      }
      /**
      @internal
      */
      stateSlot(state, slot) {
        return this.states[state * 6 + slot];
      }
      /**
      @internal
      */
      stateFlag(state, flag) {
        return (this.stateSlot(
          state,
          0
          /* ParseState.Flags */
        ) & flag) > 0;
      }
      /**
      @internal
      */
      validAction(state, action) {
        return !!this.allActions(state, (a) => a == action ? true : null);
      }
      /**
      @internal
      */
      allActions(state, action) {
        let deflt = this.stateSlot(
          state,
          4
          /* ParseState.DefaultReduce */
        );
        let result = deflt ? action(deflt) : void 0;
        for (let i = this.stateSlot(
          state,
          1
          /* ParseState.Actions */
        ); result == null; i += 3) {
          if (this.data[i] == 65535) {
            if (this.data[i + 1] == 1)
              i = pair(this.data, i + 2);
            else
              break;
          }
          result = action(pair(this.data, i + 1));
        }
        return result;
      }
      /**
      Get the states that can follow this one through shift actions or
      goto jumps. @internal
      */
      nextStates(state) {
        let result = [];
        for (let i = this.stateSlot(
          state,
          1
          /* ParseState.Actions */
        ); ; i += 3) {
          if (this.data[i] == 65535) {
            if (this.data[i + 1] == 1)
              i = pair(this.data, i + 2);
            else
              break;
          }
          if ((this.data[i + 2] & 65536 >> 16) == 0) {
            let value = this.data[i + 1];
            if (!result.some((v, i2) => i2 & 1 && v == value))
              result.push(this.data[i], value);
          }
        }
        return result;
      }
      /**
      Configure the parser. Returns a new parser instance that has the
      given settings modified. Settings not provided in `config` are
      kept from the original parser.
      */
      configure(config) {
        let copy = Object.assign(Object.create(_LRParser.prototype), this);
        if (config.props)
          copy.nodeSet = this.nodeSet.extend(...config.props);
        if (config.top) {
          let info = this.topRules[config.top];
          if (!info)
            throw new RangeError(`Invalid top rule name ${config.top}`);
          copy.top = info;
        }
        if (config.tokenizers)
          copy.tokenizers = this.tokenizers.map((t) => {
            let found = config.tokenizers.find((r) => r.from == t);
            return found ? found.to : t;
          });
        if (config.specializers) {
          copy.specializers = this.specializers.slice();
          copy.specializerSpecs = this.specializerSpecs.map((s, i) => {
            let found = config.specializers.find((r) => r.from == s.external);
            if (!found)
              return s;
            let spec = Object.assign(Object.assign({}, s), { external: found.to });
            copy.specializers[i] = getSpecializer(spec);
            return spec;
          });
        }
        if (config.contextTracker)
          copy.context = config.contextTracker;
        if (config.dialect)
          copy.dialect = this.parseDialect(config.dialect);
        if (config.strict != null)
          copy.strict = config.strict;
        if (config.wrap)
          copy.wrappers = copy.wrappers.concat(config.wrap);
        if (config.bufferLength != null)
          copy.bufferLength = config.bufferLength;
        return copy;
      }
      /**
      Tells you whether any [parse wrappers](#lr.ParserConfig.wrap)
      are registered for this parser.
      */
      hasWrappers() {
        return this.wrappers.length > 0;
      }
      /**
      Returns the name associated with a given term. This will only
      work for all terms when the parser was generated with the
      `--names` option. By default, only the names of tagged terms are
      stored.
      */
      getName(term) {
        return this.termNames ? this.termNames[term] : String(term <= this.maxNode && this.nodeSet.types[term].name || term);
      }
      /**
      The eof term id is always allocated directly after the node
      types. @internal
      */
      get eofTerm() {
        return this.maxNode + 1;
      }
      /**
      The type of top node produced by the parser.
      */
      get topNode() {
        return this.nodeSet.types[this.top[1]];
      }
      /**
      @internal
      */
      dynamicPrecedence(term) {
        let prec = this.dynamicPrecedences;
        return prec == null ? 0 : prec[term] || 0;
      }
      /**
      @internal
      */
      parseDialect(dialect) {
        let values = Object.keys(this.dialects), flags = values.map(() => false);
        if (dialect)
          for (let part of dialect.split(" ")) {
            let id2 = values.indexOf(part);
            if (id2 >= 0)
              flags[id2] = true;
          }
        let disabled = null;
        for (let i = 0; i < values.length; i++)
          if (!flags[i]) {
            for (let j = this.dialects[values[i]], id2; (id2 = this.data[j++]) != 65535; )
              (disabled || (disabled = new Uint8Array(this.maxTerm + 1)))[id2] = 1;
          }
        return new Dialect(dialect, flags, disabled);
      }
      /**
      Used by the output of the parser generator. Not available to
      user code. @hide
      */
      static deserialize(spec) {
        return new _LRParser(spec);
      }
    };
    function pair(data, off) {
      return data[off] | data[off + 1] << 16;
    }
    function findFinished(stacks) {
      let best = null;
      for (let stack of stacks) {
        let stopped = stack.p.stoppedAt;
        if ((stack.pos == stack.p.stream.end || stopped != null && stack.pos > stopped) && stack.p.parser.stateFlag(
          stack.state,
          2
          /* StateFlag.Accepting */
        ) && (!best || best.score < stack.score))
          best = stack;
      }
      return best;
    }
    function getSpecializer(spec) {
      if (spec.external) {
        let mask = spec.extend ? 1 : 0;
        return (value, stack) => spec.external(value, stack) << 1 | mask;
      }
      return spec.get;
    }
    exports2.ContextTracker = ContextTracker;
    exports2.ExternalTokenizer = ExternalTokenizer2;
    exports2.InputStream = InputStream;
    exports2.LRParser = LRParser;
    exports2.LocalTokenGroup = LocalTokenGroup;
    exports2.Stack = Stack;
  }
});

// node_modules/@lezer/generator/dist/index.cjs
var require_dist3 = __commonJS({
  "node_modules/@lezer/generator/dist/index.cjs"(exports2) {
    "use strict";
    var common = require_dist();
    var lr = require_dist2();
    var Node = class {
      constructor(start) {
        this.start = start;
      }
    };
    var GrammarDeclaration = class extends Node {
      constructor(start, rules, topRules, tokens, localTokens, context, externalTokens, externalSpecializers, externalPropSources, precedences, mainSkip, scopedSkip, dialects, externalProps, autoDelim) {
        super(start);
        this.rules = rules;
        this.topRules = topRules;
        this.tokens = tokens;
        this.localTokens = localTokens;
        this.context = context;
        this.externalTokens = externalTokens;
        this.externalSpecializers = externalSpecializers;
        this.externalPropSources = externalPropSources;
        this.precedences = precedences;
        this.mainSkip = mainSkip;
        this.scopedSkip = scopedSkip;
        this.dialects = dialects;
        this.externalProps = externalProps;
        this.autoDelim = autoDelim;
      }
      toString() {
        return Object.values(this.rules).join("\n");
      }
    };
    var RuleDeclaration = class extends Node {
      constructor(start, id, props, params, expr) {
        super(start);
        this.id = id;
        this.props = props;
        this.params = params;
        this.expr = expr;
      }
      toString() {
        return this.id.name + (this.params.length ? `<${this.params.join()}>` : "") + " -> " + this.expr;
      }
    };
    var PrecDeclaration = class extends Node {
      constructor(start, items) {
        super(start);
        this.items = items;
      }
    };
    var TokenPrecDeclaration = class extends Node {
      constructor(start, items) {
        super(start);
        this.items = items;
      }
    };
    var TokenConflictDeclaration = class extends Node {
      constructor(start, a, b) {
        super(start);
        this.a = a;
        this.b = b;
      }
    };
    var TokenDeclaration = class extends Node {
      constructor(start, precedences, conflicts, rules, literals) {
        super(start);
        this.precedences = precedences;
        this.conflicts = conflicts;
        this.rules = rules;
        this.literals = literals;
      }
    };
    var LocalTokenDeclaration = class extends Node {
      constructor(start, precedences, rules, fallback) {
        super(start);
        this.precedences = precedences;
        this.rules = rules;
        this.fallback = fallback;
      }
    };
    var LiteralDeclaration = class extends Node {
      constructor(start, literal, props) {
        super(start);
        this.literal = literal;
        this.props = props;
      }
    };
    var ContextDeclaration = class extends Node {
      constructor(start, id, source) {
        super(start);
        this.id = id;
        this.source = source;
      }
    };
    var ExternalTokenDeclaration = class extends Node {
      constructor(start, id, source, tokens, conflicts) {
        super(start);
        this.id = id;
        this.source = source;
        this.tokens = tokens;
        this.conflicts = conflicts;
      }
    };
    var ExternalSpecializeDeclaration = class extends Node {
      constructor(start, type, token, id, source, tokens) {
        super(start);
        this.type = type;
        this.token = token;
        this.id = id;
        this.source = source;
        this.tokens = tokens;
      }
    };
    var ExternalPropSourceDeclaration = class extends Node {
      constructor(start, id, source) {
        super(start);
        this.id = id;
        this.source = source;
      }
    };
    var ExternalPropDeclaration = class extends Node {
      constructor(start, id, externalID, source) {
        super(start);
        this.id = id;
        this.externalID = externalID;
        this.source = source;
      }
    };
    var Identifier = class extends Node {
      constructor(start, name) {
        super(start);
        this.name = name;
      }
      toString() {
        return this.name;
      }
    };
    var Expression = class extends Node {
      walk(f) {
        return f(this);
      }
      eq(_other) {
        return false;
      }
    };
    Expression.prototype.prec = 10;
    var NameExpression = class _NameExpression extends Expression {
      constructor(start, id, args) {
        super(start);
        this.id = id;
        this.args = args;
      }
      toString() {
        return this.id.name + (this.args.length ? `<${this.args.join()}>` : "");
      }
      eq(other) {
        return this.id.name == other.id.name && exprsEq(this.args, other.args);
      }
      walk(f) {
        let args = walkExprs(this.args, f);
        return f(args == this.args ? this : new _NameExpression(this.start, this.id, args));
      }
    };
    var SpecializeExpression = class _SpecializeExpression extends Expression {
      constructor(start, type, props, token, content) {
        super(start);
        this.type = type;
        this.props = props;
        this.token = token;
        this.content = content;
      }
      toString() {
        return `@${this.type}[${this.props.join(",")}]<${this.token}, ${this.content}>`;
      }
      eq(other) {
        return this.type == other.type && Prop.eqProps(this.props, other.props) && exprEq(this.token, other.token) && exprEq(this.content, other.content);
      }
      walk(f) {
        let token = this.token.walk(f), content = this.content.walk(f);
        return f(token == this.token && content == this.content ? this : new _SpecializeExpression(this.start, this.type, this.props, token, content));
      }
    };
    var InlineRuleExpression = class _InlineRuleExpression extends Expression {
      constructor(start, rule) {
        super(start);
        this.rule = rule;
      }
      toString() {
        let rule = this.rule;
        return `${rule.id}${rule.props.length ? `[${rule.props.join(",")}]` : ""} { ${rule.expr} }`;
      }
      eq(other) {
        let rule = this.rule, oRule = other.rule;
        return exprEq(rule.expr, oRule.expr) && rule.id.name == oRule.id.name && Prop.eqProps(rule.props, oRule.props);
      }
      walk(f) {
        let rule = this.rule, expr = rule.expr.walk(f);
        return f(expr == rule.expr ? this : new _InlineRuleExpression(this.start, new RuleDeclaration(rule.start, rule.id, rule.props, [], expr)));
      }
    };
    var ChoiceExpression = class _ChoiceExpression extends Expression {
      constructor(start, exprs) {
        super(start);
        this.exprs = exprs;
      }
      toString() {
        return this.exprs.map((e) => maybeParens(e, this)).join(" | ");
      }
      eq(other) {
        return exprsEq(this.exprs, other.exprs);
      }
      walk(f) {
        let exprs = walkExprs(this.exprs, f);
        return f(exprs == this.exprs ? this : new _ChoiceExpression(this.start, exprs));
      }
    };
    ChoiceExpression.prototype.prec = 1;
    var SequenceExpression = class _SequenceExpression extends Expression {
      constructor(start, exprs, markers, empty = false) {
        super(start);
        this.exprs = exprs;
        this.markers = markers;
        this.empty = empty;
      }
      toString() {
        return this.empty ? "()" : this.exprs.map((e) => maybeParens(e, this)).join(" ");
      }
      eq(other) {
        return exprsEq(this.exprs, other.exprs) && this.markers.every((m, i) => {
          let om = other.markers[i];
          return m.length == om.length && m.every((x, i2) => x.eq(om[i2]));
        });
      }
      walk(f) {
        let exprs = walkExprs(this.exprs, f);
        return f(exprs == this.exprs ? this : new _SequenceExpression(this.start, exprs, this.markers, this.empty && !exprs.length));
      }
    };
    SequenceExpression.prototype.prec = 2;
    var ConflictMarker = class extends Node {
      constructor(start, id, type) {
        super(start);
        this.id = id;
        this.type = type;
      }
      toString() {
        return (this.type == "ambig" ? "~" : "!") + this.id.name;
      }
      eq(other) {
        return this.id.name == other.id.name && this.type == other.type;
      }
    };
    var RepeatExpression = class _RepeatExpression extends Expression {
      constructor(start, expr, kind) {
        super(start);
        this.expr = expr;
        this.kind = kind;
      }
      toString() {
        return maybeParens(this.expr, this) + this.kind;
      }
      eq(other) {
        return exprEq(this.expr, other.expr) && this.kind == other.kind;
      }
      walk(f) {
        let expr = this.expr.walk(f);
        return f(expr == this.expr ? this : new _RepeatExpression(this.start, expr, this.kind));
      }
    };
    RepeatExpression.prototype.prec = 3;
    var LiteralExpression = class extends Expression {
      // value.length is always > 0
      constructor(start, value) {
        super(start);
        this.value = value;
      }
      toString() {
        return JSON.stringify(this.value);
      }
      eq(other) {
        return this.value == other.value;
      }
    };
    var SetExpression = class extends Expression {
      constructor(start, ranges, inverted) {
        super(start);
        this.ranges = ranges;
        this.inverted = inverted;
      }
      toString() {
        return `[${this.inverted ? "^" : ""}${this.ranges.map(([a, b]) => {
          return String.fromCodePoint(a) + (b == a + 1 ? "" : "-" + String.fromCodePoint(b));
        })}]`;
      }
      eq(other) {
        return this.inverted == other.inverted && this.ranges.length == other.ranges.length && this.ranges.every(([a, b], i) => {
          let [x, y] = other.ranges[i];
          return a == x && b == y;
        });
      }
    };
    var AnyExpression = class extends Expression {
      constructor(start) {
        super(start);
      }
      toString() {
        return "_";
      }
      eq() {
        return true;
      }
    };
    function walkExprs(exprs, f) {
      let result = null;
      for (let i = 0; i < exprs.length; i++) {
        let expr = exprs[i].walk(f);
        if (expr != exprs[i] && !result)
          result = exprs.slice(0, i);
        if (result)
          result.push(expr);
      }
      return result || exprs;
    }
    var CharClasses = {
      asciiLetter: [[65, 91], [97, 123]],
      asciiLowercase: [[97, 123]],
      asciiUppercase: [[65, 91]],
      digit: [[48, 58]],
      whitespace: [
        [9, 14],
        [32, 33],
        [133, 134],
        [160, 161],
        [5760, 5761],
        [8192, 8203],
        [8232, 8234],
        [8239, 8240],
        [8287, 8288],
        [12288, 12289]
      ],
      eof: [[65535, 65535]]
    };
    var CharClass = class extends Expression {
      constructor(start, type) {
        super(start);
        this.type = type;
      }
      toString() {
        return "@" + this.type;
      }
      eq(expr) {
        return this.type == expr.type;
      }
    };
    function exprEq(a, b) {
      return a.constructor == b.constructor && a.eq(b);
    }
    function exprsEq(a, b) {
      return a.length == b.length && a.every((e, i) => exprEq(e, b[i]));
    }
    var Prop = class extends Node {
      constructor(start, at, name, value) {
        super(start);
        this.at = at;
        this.name = name;
        this.value = value;
      }
      eq(other) {
        return this.name == other.name && this.value.length == other.value.length && this.value.every((v, i) => v.value == other.value[i].value && v.name == other.value[i].name);
      }
      toString() {
        let result = (this.at ? "@" : "") + this.name;
        if (this.value.length) {
          result += "=";
          for (let { name, value } of this.value)
            result += name ? `{${name}}` : /[^\w-]/.test(value) ? JSON.stringify(value) : value;
        }
        return result;
      }
      static eqProps(a, b) {
        return a.length == b.length && a.every((p2, i) => p2.eq(b[i]));
      }
    };
    var PropPart = class extends Node {
      constructor(start, value, name) {
        super(start);
        this.value = value;
        this.name = name;
      }
    };
    function maybeParens(node, parent) {
      return node.prec < parent.prec ? "(" + node.toString() + ")" : node.toString();
    }
    var GenError = class extends Error {
    };
    function hasProps(props) {
      for (let _p in props)
        return true;
      return false;
    }
    var termHash = 0;
    var Term = class {
      constructor(name, flags, nodeName, props = {}) {
        this.name = name;
        this.flags = flags;
        this.nodeName = nodeName;
        this.props = props;
        this.hash = ++termHash;
        this.id = -1;
        this.rules = [];
      }
      toString() {
        return this.name;
      }
      get nodeType() {
        return this.top || this.nodeName != null || hasProps(this.props) || this.repeated;
      }
      get terminal() {
        return (this.flags & 1) > 0;
      }
      get eof() {
        return (this.flags & 4) > 0;
      }
      get error() {
        return "error" in this.props;
      }
      get top() {
        return (this.flags & 2) > 0;
      }
      get interesting() {
        return this.flags > 0 || this.nodeName != null;
      }
      get repeated() {
        return (this.flags & 16) > 0;
      }
      set preserve(value) {
        this.flags = value ? this.flags | 8 : this.flags & ~8;
      }
      get preserve() {
        return (this.flags & 8) > 0;
      }
      set inline(value) {
        this.flags = value ? this.flags | 32 : this.flags & ~32;
      }
      get inline() {
        return (this.flags & 32) > 0;
      }
      cmp(other) {
        return this.hash - other.hash;
      }
    };
    var TermSet = class {
      constructor() {
        this.terms = [];
        this.names = /* @__PURE__ */ Object.create(null);
        this.tops = [];
        this.eof = this.term(
          "\u2404",
          null,
          1 | 4
          /* TermFlag.Eof */
        );
        this.error = this.term(
          "\u26A0",
          "\u26A0",
          8
          /* TermFlag.Preserve */
        );
      }
      term(name, nodeName, flags = 0, props = {}) {
        let term = new Term(name, flags, nodeName, props);
        this.terms.push(term);
        this.names[name] = term;
        return term;
      }
      makeTop(nodeName, props) {
        const term = this.term("@top", nodeName, 2, props);
        this.tops.push(term);
        return term;
      }
      makeTerminal(name, nodeName, props = {}) {
        return this.term(name, nodeName, 1, props);
      }
      makeNonTerminal(name, nodeName, props = {}) {
        return this.term(name, nodeName, 0, props);
      }
      makeRepeat(name) {
        return this.term(
          name,
          null,
          16
          /* TermFlag.Repeated */
        );
      }
      uniqueName(name) {
        for (let i = 0; ; i++) {
          let cur = i ? `${name}-${i}` : name;
          if (!this.names[cur])
            return cur;
        }
      }
      finish(rules) {
        for (let rule of rules)
          rule.name.rules.push(rule);
        this.terms = this.terms.filter((t) => t.terminal || t.preserve || rules.some((r) => r.name == t || r.parts.includes(t)));
        let names = {};
        let nodeTypes = [this.error];
        this.error.id = 0;
        let nextID = 0 + 1;
        for (let term of this.terms)
          if (term.id < 0 && term.nodeType && !term.repeated) {
            term.id = nextID++;
            nodeTypes.push(term);
          }
        let minRepeatTerm = nextID;
        for (let term of this.terms)
          if (term.repeated) {
            term.id = nextID++;
            nodeTypes.push(term);
          }
        this.eof.id = nextID++;
        for (let term of this.terms) {
          if (term.id < 0)
            term.id = nextID++;
          if (term.name)
            names[term.id] = term.name;
        }
        if (nextID >= 65534)
          throw new GenError("Too many terms");
        return { nodeTypes, names, minRepeatTerm, maxTerm: nextID - 1 };
      }
    };
    function cmpSet(a, b, cmp) {
      if (a.length != b.length)
        return a.length - b.length;
      for (let i = 0; i < a.length; i++) {
        let diff = cmp(a[i], b[i]);
        if (diff)
          return diff;
      }
      return 0;
    }
    var none$3 = [];
    var Conflicts = class _Conflicts {
      constructor(precedence, ambigGroups = none$3, cut = 0) {
        this.precedence = precedence;
        this.ambigGroups = ambigGroups;
        this.cut = cut;
      }
      join(other) {
        if (this == _Conflicts.none || this == other)
          return other;
        if (other == _Conflicts.none)
          return this;
        return new _Conflicts(Math.max(this.precedence, other.precedence), union(this.ambigGroups, other.ambigGroups), Math.max(this.cut, other.cut));
      }
      cmp(other) {
        return this.precedence - other.precedence || cmpSet(this.ambigGroups, other.ambigGroups, (a, b) => a < b ? -1 : a > b ? 1 : 0) || this.cut - other.cut;
      }
    };
    Conflicts.none = new Conflicts(0);
    function union(a, b) {
      if (a.length == 0 || a == b)
        return b;
      if (b.length == 0)
        return a;
      let result = a.slice();
      for (let value of b)
        if (!a.includes(value))
          result.push(value);
      return result.sort();
    }
    var ruleID = 0;
    var Rule = class {
      constructor(name, parts, conflicts, skip) {
        this.name = name;
        this.parts = parts;
        this.conflicts = conflicts;
        this.skip = skip;
        this.id = ruleID++;
      }
      cmp(rule) {
        return this.id - rule.id;
      }
      cmpNoName(rule) {
        return this.parts.length - rule.parts.length || this.skip.hash - rule.skip.hash || this.parts.reduce((r, s, i) => r || s.cmp(rule.parts[i]), 0) || cmpSet(this.conflicts, rule.conflicts, (a, b) => a.cmp(b));
      }
      toString() {
        return this.name + " -> " + this.parts.join(" ");
      }
      get isRepeatWrap() {
        return this.name.repeated && this.parts.length == 2 && this.parts[0] == this.name;
      }
      sameReduce(other) {
        return this.name == other.name && this.parts.length == other.parts.length && this.isRepeatWrap == other.isRepeatWrap;
      }
    };
    var MAX_CHAR = 65535;
    var Edge = class {
      constructor(from, to, target) {
        this.from = from;
        this.to = to;
        this.target = target;
      }
      toString() {
        return `-> ${this.target.id}[label=${JSON.stringify(this.from < 0 ? "\u03B5" : charFor(this.from) + (this.to > this.from + 1 ? "-" + charFor(this.to - 1) : ""))}]`;
      }
    };
    function charFor(n) {
      return n > MAX_CHAR ? "\u221E" : n == 10 ? "\\n" : n == 13 ? "\\r" : n < 32 || n >= 55296 && n < 57343 ? "\\u{" + n.toString(16) + "}" : String.fromCharCode(n);
    }
    function minimize(states, start) {
      let partition = /* @__PURE__ */ Object.create(null);
      let byAccepting = /* @__PURE__ */ Object.create(null);
      for (let state of states) {
        let id = ids(state.accepting);
        let group = byAccepting[id] || (byAccepting[id] = []);
        group.push(state);
        partition[state.id] = group;
      }
      for (; ; ) {
        let split = false, newPartition = /* @__PURE__ */ Object.create(null);
        for (let state of states) {
          if (newPartition[state.id])
            continue;
          let group = partition[state.id];
          if (group.length == 1) {
            newPartition[group[0].id] = group;
            continue;
          }
          let parts = [];
          groups: for (let state2 of group) {
            for (let p2 of parts) {
              if (isEquivalent(state2, p2[0], partition)) {
                p2.push(state2);
                continue groups;
              }
            }
            parts.push([state2]);
          }
          if (parts.length > 1)
            split = true;
          for (let p2 of parts)
            for (let s of p2)
              newPartition[s.id] = p2;
        }
        if (!split)
          return applyMinimization(states, start, partition);
        partition = newPartition;
      }
    }
    function isEquivalent(a, b, partition) {
      if (a.edges.length != b.edges.length)
        return false;
      for (let i = 0; i < a.edges.length; i++) {
        let eA = a.edges[i], eB = b.edges[i];
        if (eA.from != eB.from || eA.to != eB.to || partition[eA.target.id] != partition[eB.target.id])
          return false;
      }
      return true;
    }
    function applyMinimization(states, start, partition) {
      for (let state of states) {
        for (let i = 0; i < state.edges.length; i++) {
          let edge = state.edges[i], target = partition[edge.target.id][0];
          if (target != edge.target)
            state.edges[i] = new Edge(edge.from, edge.to, target);
        }
      }
      return partition[start.id][0];
    }
    var stateID = 1;
    var State$1 = class State2 {
      constructor(accepting = [], id = stateID++) {
        this.accepting = accepting;
        this.id = id;
        this.edges = [];
      }
      edge(from, to, target) {
        this.edges.push(new Edge(from, to, target));
      }
      nullEdge(target) {
        this.edge(-1, -1, target);
      }
      compile() {
        let labeled = /* @__PURE__ */ Object.create(null), localID = 0;
        let startState = explore(this.closure().sort((a, b) => a.id - b.id));
        return minimize(Object.values(labeled), startState);
        function explore(states) {
          let newState = labeled[ids(states)] = new State2(states.reduce((a, s) => union(a, s.accepting), []), localID++);
          let out = [];
          for (let state of states)
            for (let edge of state.edges) {
              if (edge.from >= 0)
                out.push(edge);
            }
          let transitions = mergeEdges(out);
          for (let merged of transitions) {
            let targets = merged.targets.sort((a, b) => a.id - b.id);
            newState.edge(merged.from, merged.to, labeled[ids(targets)] || explore(targets));
          }
          return newState;
        }
      }
      closure() {
        let result = [], seen = /* @__PURE__ */ Object.create(null);
        function explore(state) {
          if (seen[state.id])
            return;
          seen[state.id] = true;
          if (state.edges.some((e) => e.from >= 0) || state.accepting.length > 0 && !state.edges.some((e) => sameSet$1(state.accepting, e.target.accepting)))
            result.push(state);
          for (let edge of state.edges)
            if (edge.from < 0)
              explore(edge.target);
        }
        explore(this);
        return result;
      }
      findConflicts(occurTogether) {
        let conflicts = [], cycleTerms = this.cycleTerms();
        function add(a, b, soft, aEdges, bEdges) {
          if (a.id < b.id) {
            [a, b] = [b, a];
            soft = -soft;
          }
          let found = conflicts.find((c) => c.a == a && c.b == b);
          if (!found)
            conflicts.push(new Conflict$1(a, b, soft, exampleFromEdges(aEdges), bEdges && exampleFromEdges(bEdges)));
          else if (found.soft != soft)
            found.soft = 0;
        }
        this.reachable((state, edges) => {
          if (state.accepting.length == 0)
            return;
          for (let i = 0; i < state.accepting.length; i++)
            for (let j = i + 1; j < state.accepting.length; j++)
              add(state.accepting[i], state.accepting[j], 0, edges);
          state.reachable((s, es) => {
            if (s != state)
              for (let term of s.accepting) {
                let hasCycle = cycleTerms.includes(term);
                for (let orig of state.accepting)
                  if (term != orig)
                    add(term, orig, hasCycle || cycleTerms.includes(orig) || !occurTogether(term, orig) ? 0 : 1, edges, edges.concat(es));
              }
          });
        });
        return conflicts;
      }
      cycleTerms() {
        let work = [];
        this.reachable((state) => {
          for (let { target } of state.edges)
            work.push(state, target);
        });
        let table = /* @__PURE__ */ new Map();
        let haveCycle = [];
        for (let i = 0; i < work.length; ) {
          let from = work[i++], to = work[i++];
          let entry = table.get(from);
          if (!entry)
            table.set(from, entry = []);
          if (entry.includes(to))
            continue;
          if (from == to) {
            if (!haveCycle.includes(from))
              haveCycle.push(from);
          } else {
            for (let next of entry)
              work.push(from, next);
            entry.push(to);
          }
        }
        let result = [];
        for (let state of haveCycle) {
          for (let term of state.accepting) {
            if (!result.includes(term))
              result.push(term);
          }
        }
        return result;
      }
      reachable(f) {
        let seen = [], edges = [];
        (function explore(s) {
          f(s, edges);
          seen.push(s);
          for (let edge of s.edges)
            if (!seen.includes(edge.target)) {
              edges.push(edge);
              explore(edge.target);
              edges.pop();
            }
        })(this);
      }
      toString() {
        let out = "digraph {\n";
        this.reachable((state) => {
          if (state.accepting.length)
            out += `  ${state.id} [label=${JSON.stringify(state.accepting.join())}];
`;
          for (let edge of state.edges)
            out += `  ${state.id} ${edge};
`;
        });
        return out + "}";
      }
      // Tokenizer data is represented as a single flat array. This
      // contains regions for each tokenizer state. Region offsets are
      // used to identify states.
      //
      // Each state is laid out as:
      //  - Token group mask
      //  - Offset of the end of the accepting data
      //  - Number of outgoing edges in the state
      //  - Pairs of token masks and term ids that indicate the accepting
      //    states, sorted by precedence
      //  - Triples for the edges: each with a low and high bound and the
      //    offset of the next state.
      toArray(groupMasks, precedence) {
        let offsets = [];
        let data = [];
        this.reachable((state) => {
          let start = data.length;
          let acceptEnd = start + 3 + state.accepting.length * 2;
          offsets[state.id] = start;
          data.push(state.stateMask(groupMasks), acceptEnd, state.edges.length);
          state.accepting.sort((a, b) => precedence.indexOf(a.id) - precedence.indexOf(b.id));
          for (let term of state.accepting)
            data.push(term.id, groupMasks[term.id] || 65535);
          for (let edge of state.edges)
            data.push(edge.from, edge.to, -edge.target.id - 1);
        });
        for (let i = 0; i < data.length; i++)
          if (data[i] < 0)
            data[i] = offsets[-data[i] - 1];
        if (data.length > Math.pow(2, 16))
          throw new GenError("Tokenizer tables too big to represent with 16-bit offsets.");
        return Uint16Array.from(data);
      }
      stateMask(groupMasks) {
        let mask = 0;
        this.reachable((state) => {
          for (let term of state.accepting)
            mask |= groupMasks[term.id] || 65535;
        });
        return mask;
      }
    };
    var Conflict$1 = class Conflict {
      constructor(a, b, soft, exampleA, exampleB) {
        this.a = a;
        this.b = b;
        this.soft = soft;
        this.exampleA = exampleA;
        this.exampleB = exampleB;
      }
    };
    function exampleFromEdges(edges) {
      let str = "";
      for (let i = 0; i < edges.length; i++)
        str += String.fromCharCode(edges[i].from);
      return str;
    }
    function ids(elts) {
      let result = "";
      for (let elt of elts) {
        if (result.length)
          result += "-";
        result += elt.id;
      }
      return result;
    }
    function sameSet$1(a, b) {
      if (a.length != b.length)
        return false;
      for (let i = 0; i < a.length; i++)
        if (a[i] != b[i])
          return false;
      return true;
    }
    var MergedEdge = class {
      constructor(from, to, targets) {
        this.from = from;
        this.to = to;
        this.targets = targets;
      }
    };
    function mergeEdges(edges) {
      let separate = [], result = [];
      for (let edge of edges) {
        if (!separate.includes(edge.from))
          separate.push(edge.from);
        if (!separate.includes(edge.to))
          separate.push(edge.to);
      }
      separate.sort((a, b) => a - b);
      for (let i = 1; i < separate.length; i++) {
        let from = separate[i - 1], to = separate[i];
        let found = [];
        for (let edge of edges)
          if (edge.to > from && edge.from < to) {
            for (let target of edge.target.closure())
              if (!found.includes(target))
                found.push(target);
          }
        if (found.length)
          result.push(new MergedEdge(from, to, found));
      }
      let eof = edges.filter(
        (e) => e.from == 65535 && e.to == 65535
        /* Seq.End */
      );
      if (eof.length) {
        let found = [];
        for (let edge of eof)
          for (let target of edge.target.closure())
            if (!found.includes(target))
              found.push(target);
        if (found.length)
          result.push(new MergedEdge(65535, 65535, found));
      }
      return result;
    }
    var word = /[\w_-]+/gy;
    try {
      word = /[\p{Alphabetic}\d_-]+/ugy;
    } catch (_) {
    }
    var none$2 = [];
    var Input = class {
      constructor(string, fileName = null) {
        this.string = string;
        this.fileName = fileName;
        this.type = "sof";
        this.value = null;
        this.start = 0;
        this.end = 0;
        this.next();
      }
      lineInfo(pos) {
        for (let line = 1, cur = 0; ; ) {
          let next = this.string.indexOf("\n", cur);
          if (next > -1 && next < pos) {
            ++line;
            cur = next + 1;
          } else {
            return { line, ch: pos - cur };
          }
        }
      }
      message(msg, pos = -1) {
        let posInfo = this.fileName || "";
        if (pos > -1) {
          let info = this.lineInfo(pos);
          posInfo += (posInfo ? " " : "") + info.line + ":" + info.ch;
        }
        return posInfo ? msg + ` (${posInfo})` : msg;
      }
      raise(msg, pos = -1) {
        throw new GenError(this.message(msg, pos));
      }
      match(pos, re) {
        let match = re.exec(this.string.slice(pos));
        return match ? pos + match[0].length : -1;
      }
      next() {
        let start = this.match(this.end, /^(\s|\/\/.*|\/\*[^]*?\*\/)*/);
        if (start == this.string.length)
          return this.set("eof", null, start, start);
        let next = this.string[start];
        if (next == '"') {
          let end = this.match(start + 1, /^(\\.|[^"\\])*"/);
          if (end == -1)
            this.raise("Unterminated string literal", start);
          return this.set("string", readString(this.string.slice(start + 1, end - 1)), start, end);
        } else if (next == "'") {
          let end = this.match(start + 1, /^(\\.|[^'\\])*'/);
          if (end == -1)
            this.raise("Unterminated string literal", start);
          return this.set("string", readString(this.string.slice(start + 1, end - 1)), start, end);
        } else if (next == "@") {
          word.lastIndex = start + 1;
          let m = word.exec(this.string);
          if (!m)
            return this.raise("@ without a name", start);
          return this.set("at", m[0], start, start + 1 + m[0].length);
        } else if ((next == "$" || next == "!") && this.string[start + 1] == "[") {
          let end = this.match(start + 2, /^(?:\\.|[^\]\\])*\]/);
          if (end == -1)
            this.raise("Unterminated character set", start);
          return this.set("set", this.string.slice(start + 2, end - 1), start, end);
        } else if (/[\[\]()!~+*?{}<>\.,|:$=]/.test(next)) {
          return this.set(next, null, start, start + 1);
        } else {
          word.lastIndex = start;
          let m = word.exec(this.string);
          if (!m)
            return this.raise("Unexpected character " + JSON.stringify(next), start);
          return this.set("id", m[0], start, start + m[0].length);
        }
      }
      set(type, value, start, end) {
        this.type = type;
        this.value = value;
        this.start = start;
        this.end = end;
      }
      eat(type, value = null) {
        if (this.type == type && (value == null || this.value === value)) {
          this.next();
          return true;
        } else {
          return false;
        }
      }
      unexpected() {
        return this.raise(`Unexpected token '${this.string.slice(this.start, this.end)}'`, this.start);
      }
      expect(type, value = null) {
        let val = this.value;
        if (this.type != type || !(value == null || val === value))
          this.unexpected();
        this.next();
        return val;
      }
      parse() {
        return parseGrammar(this);
      }
    };
    function parseGrammar(input) {
      let start = input.start;
      let rules = [];
      let prec = null;
      let tokens = null;
      let localTokens = [];
      let mainSkip = null;
      let scopedSkip = [];
      let dialects = [];
      let context = null;
      let external = [];
      let specialized = [];
      let props = [];
      let propSources = [];
      let tops = [];
      let sawTop = false;
      let autoDelim = false;
      while (input.type != "eof") {
        let start2 = input.start;
        if (input.eat("at", "top")) {
          if (input.type != "id")
            input.raise(`Top rules must have a name`, input.start);
          tops.push(parseRule(input, parseIdent(input)));
          sawTop = true;
        } else if (input.type == "at" && input.value == "tokens") {
          if (tokens)
            input.raise(`Multiple @tokens declaractions`, input.start);
          else
            tokens = parseTokens(input);
        } else if (input.eat("at", "local")) {
          input.expect("id", "tokens");
          localTokens.push(parseLocalTokens(input, start2));
        } else if (input.eat("at", "context")) {
          if (context)
            input.raise(`Multiple @context declarations`, start2);
          let id = parseIdent(input);
          input.expect("id", "from");
          let source = input.expect("string");
          context = new ContextDeclaration(start2, id, source);
        } else if (input.eat("at", "external")) {
          if (input.eat("id", "tokens"))
            external.push(parseExternalTokens(input, start2));
          else if (input.eat("id", "prop"))
            props.push(parseExternalProp(input, start2));
          else if (input.eat("id", "extend"))
            specialized.push(parseExternalSpecialize(input, "extend", start2));
          else if (input.eat("id", "specialize"))
            specialized.push(parseExternalSpecialize(input, "specialize", start2));
          else if (input.eat("id", "propSource"))
            propSources.push(parseExternalPropSource(input, start2));
          else
            input.unexpected();
        } else if (input.eat("at", "dialects")) {
          input.expect("{");
          for (let first = true; !input.eat("}"); first = false) {
            if (!first)
              input.eat(",");
            dialects.push(parseIdent(input));
          }
        } else if (input.type == "at" && input.value == "precedence") {
          if (prec)
            input.raise(`Multiple precedence declarations`, input.start);
          prec = parsePrecedence(input);
        } else if (input.eat("at", "detectDelim")) {
          autoDelim = true;
        } else if (input.eat("at", "skip")) {
          let skip = parseBracedExpr(input);
          if (input.type == "{") {
            input.next();
            let rules2 = [], topRules = [];
            while (!input.eat("}")) {
              if (input.eat("at", "top")) {
                topRules.push(parseRule(input, parseIdent(input)));
                sawTop = true;
              } else {
                rules2.push(parseRule(input));
              }
            }
            scopedSkip.push({ expr: skip, topRules, rules: rules2 });
          } else {
            if (mainSkip)
              input.raise(`Multiple top-level skip declarations`, input.start);
            mainSkip = skip;
          }
        } else {
          rules.push(parseRule(input));
        }
      }
      if (!sawTop)
        return input.raise(`Missing @top declaration`);
      return new GrammarDeclaration(start, rules, tops, tokens, localTokens, context, external, specialized, propSources, prec, mainSkip, scopedSkip, dialects, props, autoDelim);
    }
    function parseRule(input, named) {
      let start = named ? named.start : input.start;
      let id = named || parseIdent(input);
      let props = parseProps(input);
      let params = [];
      if (input.eat("<"))
        while (!input.eat(">")) {
          if (params.length)
            input.expect(",");
          params.push(parseIdent(input));
        }
      let expr = parseBracedExpr(input);
      return new RuleDeclaration(start, id, props, params, expr);
    }
    function parseProps(input) {
      if (input.type != "[")
        return none$2;
      let props = [];
      input.expect("[");
      while (!input.eat("]")) {
        if (props.length)
          input.expect(",");
        props.push(parseProp(input));
      }
      return props;
    }
    function parseProp(input) {
      let start = input.start, value = [], name = input.value, at = input.type == "at";
      if (!input.eat("at") && !input.eat("id"))
        input.unexpected();
      if (input.eat("="))
        for (; ; ) {
          if (input.type == "string" || input.type == "id") {
            value.push(new PropPart(input.start, input.value, null));
            input.next();
          } else if (input.eat(".")) {
            value.push(new PropPart(input.start, ".", null));
          } else if (input.eat("{")) {
            value.push(new PropPart(input.start, null, input.expect("id")));
            input.expect("}");
          } else {
            break;
          }
        }
      return new Prop(start, at, name, value);
    }
    function parseBracedExpr(input) {
      input.expect("{");
      let expr = parseExprChoice(input);
      input.expect("}");
      return expr;
    }
    var SET_MARKER = "\uFDDA";
    function parseExprInner(input) {
      let start = input.start;
      if (input.eat("(")) {
        if (input.eat(")"))
          return new SequenceExpression(start, none$2, [none$2, none$2]);
        let expr = parseExprChoice(input);
        input.expect(")");
        return expr;
      } else if (input.type == "string") {
        let value = input.value;
        input.next();
        if (value.length == 0)
          return new SequenceExpression(start, none$2, [none$2, none$2]);
        return new LiteralExpression(start, value);
      } else if (input.eat("id", "_")) {
        return new AnyExpression(start);
      } else if (input.type == "set") {
        let content = input.value, invert = input.string[input.start] == "!";
        let unescaped = readString(content.replace(/\\.|-|"/g, (m) => {
          return m == "-" ? SET_MARKER : m == '"' ? '\\"' : m;
        }));
        let ranges = [];
        for (let pos = 0; pos < unescaped.length; ) {
          let code = unescaped.codePointAt(pos);
          pos += code > 65535 ? 2 : 1;
          if (pos < unescaped.length - 1 && unescaped[pos] == SET_MARKER) {
            let end = unescaped.codePointAt(pos + 1);
            pos += end > 65535 ? 3 : 2;
            if (end < code)
              input.raise("Invalid character range", input.start);
            addRange(input, ranges, code, end + 1);
          } else {
            if (code == SET_MARKER.charCodeAt(0))
              code = 45;
            addRange(input, ranges, code, code + 1);
          }
        }
        input.next();
        return new SetExpression(start, ranges.sort((a, b) => a[0] - b[0]), invert);
      } else if (input.type == "at" && (input.value == "specialize" || input.value == "extend")) {
        let { start: start2, value } = input;
        input.next();
        let props = parseProps(input);
        input.expect("<");
        let token = parseExprChoice(input), content;
        if (input.eat(",")) {
          content = parseExprChoice(input);
        } else if (token instanceof LiteralExpression) {
          content = token;
        } else {
          input.raise(`@${value} requires two arguments when its first argument isn't a literal string`);
        }
        input.expect(">");
        return new SpecializeExpression(start2, value, props, token, content);
      } else if (input.type == "at" && CharClasses.hasOwnProperty(input.value)) {
        let cls = new CharClass(input.start, input.value);
        input.next();
        return cls;
      } else if (input.type == "[") {
        let rule = parseRule(input, new Identifier(start, "_anon"));
        if (rule.params.length)
          input.raise(`Inline rules can't have parameters`, rule.start);
        return new InlineRuleExpression(start, rule);
      } else {
        let id = parseIdent(input);
        if (input.type == "[" || input.type == "{") {
          let rule = parseRule(input, id);
          if (rule.params.length)
            input.raise(`Inline rules can't have parameters`, rule.start);
          return new InlineRuleExpression(start, rule);
        } else {
          if (input.eat(".") && id.name == "std" && CharClasses.hasOwnProperty(input.value)) {
            let cls = new CharClass(start, input.value);
            input.next();
            return cls;
          }
          return new NameExpression(start, id, parseArgs(input));
        }
      }
    }
    function parseArgs(input) {
      let args = [];
      if (input.eat("<"))
        while (!input.eat(">")) {
          if (args.length)
            input.expect(",");
          args.push(parseExprChoice(input));
        }
      return args;
    }
    function addRange(input, ranges, from, to) {
      if (!ranges.every(([a, b]) => b <= from || a >= to))
        input.raise("Overlapping character range", input.start);
      ranges.push([from, to]);
    }
    function parseExprSuffix(input) {
      let start = input.start;
      let expr = parseExprInner(input);
      for (; ; ) {
        let kind = input.type;
        if (input.eat("*") || input.eat("?") || input.eat("+"))
          expr = new RepeatExpression(start, expr, kind);
        else
          return expr;
      }
    }
    function endOfSequence(input) {
      return input.type == "}" || input.type == ")" || input.type == "|" || input.type == "/" || input.type == "/\\" || input.type == "{" || input.type == "," || input.type == ">";
    }
    function parseExprSequence(input) {
      let start = input.start, exprs = [], markers = [none$2];
      do {
        for (; ; ) {
          let localStart = input.start, markerType;
          if (input.eat("~"))
            markerType = "ambig";
          else if (input.eat("!"))
            markerType = "prec";
          else
            break;
          markers[markers.length - 1] = markers[markers.length - 1].concat(new ConflictMarker(localStart, parseIdent(input), markerType));
        }
        if (endOfSequence(input))
          break;
        exprs.push(parseExprSuffix(input));
        markers.push(none$2);
      } while (!endOfSequence(input));
      if (exprs.length == 1 && markers.every((ms) => ms.length == 0))
        return exprs[0];
      return new SequenceExpression(start, exprs, markers, !exprs.length);
    }
    function parseExprChoice(input) {
      let start = input.start, left = parseExprSequence(input);
      if (!input.eat("|"))
        return left;
      let exprs = [left];
      do {
        exprs.push(parseExprSequence(input));
      } while (input.eat("|"));
      let empty = exprs.find((s) => s instanceof SequenceExpression && s.empty);
      if (empty)
        input.raise("Empty expression in choice operator. If this is intentional, use () to make it explicit.", empty.start);
      return new ChoiceExpression(start, exprs);
    }
    function parseIdent(input) {
      if (input.type != "id")
        input.unexpected();
      let start = input.start, name = input.value;
      input.next();
      return new Identifier(start, name);
    }
    function parsePrecedence(input) {
      let start = input.start;
      input.next();
      input.expect("{");
      let items = [];
      while (!input.eat("}")) {
        if (items.length)
          input.eat(",");
        items.push({
          id: parseIdent(input),
          type: input.eat("at", "left") ? "left" : input.eat("at", "right") ? "right" : input.eat("at", "cut") ? "cut" : null
        });
      }
      return new PrecDeclaration(start, items);
    }
    function parseTokens(input) {
      let start = input.start;
      input.next();
      input.expect("{");
      let tokenRules = [];
      let literals = [];
      let precedences = [];
      let conflicts = [];
      while (!input.eat("}")) {
        if (input.type == "at" && input.value == "precedence") {
          precedences.push(parseTokenPrecedence(input));
        } else if (input.type == "at" && input.value == "conflict") {
          conflicts.push(parseTokenConflict(input));
        } else if (input.type == "string") {
          literals.push(new LiteralDeclaration(input.start, input.expect("string"), parseProps(input)));
        } else {
          tokenRules.push(parseRule(input));
        }
      }
      return new TokenDeclaration(start, precedences, conflicts, tokenRules, literals);
    }
    function parseLocalTokens(input, start) {
      input.expect("{");
      let tokenRules = [];
      let precedences = [];
      let fallback = null;
      while (!input.eat("}")) {
        if (input.type == "at" && input.value == "precedence") {
          precedences.push(parseTokenPrecedence(input));
        } else if (input.eat("at", "else") && !fallback) {
          fallback = { id: parseIdent(input), props: parseProps(input) };
        } else {
          tokenRules.push(parseRule(input));
        }
      }
      return new LocalTokenDeclaration(start, precedences, tokenRules, fallback);
    }
    function parseTokenPrecedence(input) {
      let start = input.start;
      input.next();
      input.expect("{");
      let tokens = [];
      while (!input.eat("}")) {
        if (tokens.length)
          input.eat(",");
        let expr = parseExprInner(input);
        if (expr instanceof LiteralExpression || expr instanceof NameExpression)
          tokens.push(expr);
        else
          input.raise(`Invalid expression in token precedences`, expr.start);
      }
      return new TokenPrecDeclaration(start, tokens);
    }
    function parseTokenConflict(input) {
      let start = input.start;
      input.next();
      input.expect("{");
      let a = parseExprInner(input);
      if (!(a instanceof LiteralExpression || a instanceof NameExpression))
        input.raise(`Invalid expression in token conflict`, a.start);
      input.eat(",");
      let b = parseExprInner(input);
      if (!(b instanceof LiteralExpression || b instanceof NameExpression))
        input.raise(`Invalid expression in token conflict`, b.start);
      input.expect("}");
      return new TokenConflictDeclaration(start, a, b);
    }
    function parseExternalTokenSet(input, allowConflicts) {
      let tokens = [], conflicts = [];
      input.expect("{");
      for (let first = true; !input.eat("}"); first = false) {
        if (!first)
          input.eat(",");
        if (allowConflicts && input.eat("at", "conflict")) {
          input.expect("{");
          for (let f = true; !input.eat("}"); f = false) {
            if (!f)
              input.eat(",");
            conflicts.push(parseIdent(input));
          }
        } else {
          let id = parseIdent(input);
          let props = parseProps(input);
          tokens.push({ id, props });
        }
      }
      return { tokens, conflicts };
    }
    function parseExternalTokens(input, start) {
      let id = parseIdent(input);
      input.expect("id", "from");
      let from = input.expect("string");
      let { tokens, conflicts } = parseExternalTokenSet(input, true);
      return new ExternalTokenDeclaration(start, id, from, tokens, conflicts);
    }
    function parseExternalSpecialize(input, type, start) {
      let token = parseBracedExpr(input);
      let id = parseIdent(input);
      input.expect("id", "from");
      let from = input.expect("string");
      return new ExternalSpecializeDeclaration(start, type, token, id, from, parseExternalTokenSet(input, false).tokens);
    }
    function parseExternalPropSource(input, start) {
      let id = parseIdent(input);
      input.expect("id", "from");
      return new ExternalPropSourceDeclaration(start, id, input.expect("string"));
    }
    function parseExternalProp(input, start) {
      let externalID = parseIdent(input);
      let id = input.eat("id", "as") ? parseIdent(input) : externalID;
      input.expect("id", "from");
      let from = input.expect("string");
      return new ExternalPropDeclaration(start, id, externalID, from);
    }
    function readString(string) {
      let point = /\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|([ntbrf0])|(.))|[^]/yig;
      let out = "", m;
      while (m = point.exec(string)) {
        let [all, u1, u2, u3, single, unknown] = m;
        if (u1 || u2 || u3)
          out += String.fromCodePoint(parseInt(u1 || u2 || u3, 16));
        else if (single)
          out += single == "n" ? "\n" : single == "t" ? "	" : single == "0" ? "\0" : single == "r" ? "\r" : single == "f" ? "\f" : "\b";
        else if (unknown)
          out += unknown;
        else
          out += all;
      }
      return out;
    }
    function hash(a, b) {
      return (a << 5) + a + b;
    }
    function hashString(h, s) {
      for (let i = 0; i < s.length; i++)
        h = hash(h, s.charCodeAt(i));
      return h;
    }
    var verbose = typeof process != "undefined" && process.env.LOG || "";
    var timing = /\btime\b/.test(verbose);
    var time = timing ? (label, f) => {
      let t0 = Date.now();
      let result = f();
      console.log(`${label} (${((Date.now() - t0) / 1e3).toFixed(2)}s)`);
      return result;
    } : (_label, f) => f();
    var Pos = class _Pos {
      constructor(rule, pos, ahead, ambigAhead, skipAhead, via) {
        this.rule = rule;
        this.pos = pos;
        this.ahead = ahead;
        this.ambigAhead = ambigAhead;
        this.skipAhead = skipAhead;
        this.via = via;
        this.hash = 0;
      }
      finish() {
        let h = hash(hash(this.rule.id, this.pos), this.skipAhead.hash);
        for (let a of this.ahead)
          h = hash(h, a.hash);
        for (let group of this.ambigAhead)
          h = hashString(h, group);
        this.hash = h;
        return this;
      }
      get next() {
        return this.pos < this.rule.parts.length ? this.rule.parts[this.pos] : null;
      }
      advance() {
        return new _Pos(this.rule, this.pos + 1, this.ahead, this.ambigAhead, this.skipAhead, this.via).finish();
      }
      get skip() {
        return this.pos == this.rule.parts.length ? this.skipAhead : this.rule.skip;
      }
      cmp(pos) {
        return this.rule.cmp(pos.rule) || this.pos - pos.pos || this.skipAhead.hash - pos.skipAhead.hash || cmpSet(this.ahead, pos.ahead, (a, b) => a.cmp(b)) || cmpSet(this.ambigAhead, pos.ambigAhead, cmpStr);
      }
      eqSimple(pos) {
        return pos.rule == this.rule && pos.pos == this.pos;
      }
      toString() {
        let parts = this.rule.parts.map((t) => t.name);
        parts.splice(this.pos, 0, "\xB7");
        return `${this.rule.name} -> ${parts.join(" ")}`;
      }
      eq(other) {
        return this == other || this.hash == other.hash && this.rule == other.rule && this.pos == other.pos && this.skipAhead == other.skipAhead && sameSet(this.ahead, other.ahead) && sameSet(this.ambigAhead, other.ambigAhead);
      }
      trail(maxLen = 60) {
        let result = [];
        for (let pos = this; pos; pos = pos.via) {
          for (let i = pos.pos - 1; i >= 0; i--)
            result.push(pos.rule.parts[i]);
        }
        let value = result.reverse().join(" ");
        if (value.length > maxLen)
          value = value.slice(value.length - maxLen).replace(/.*? /, "\u2026 ");
        return value;
      }
      conflicts(pos = this.pos) {
        let result = this.rule.conflicts[pos];
        if (pos == this.rule.parts.length && this.ambigAhead.length)
          result = result.join(new Conflicts(0, this.ambigAhead));
        return result;
      }
      static addOrigins(group, context) {
        let result = group.slice();
        for (let i = 0; i < result.length; i++) {
          let next = result[i];
          if (next.pos == 0)
            for (let pos of context) {
              if (pos.next == next.rule.name && !result.includes(pos))
                result.push(pos);
            }
        }
        return result;
      }
    };
    function conflictsAt(group) {
      let result = Conflicts.none;
      for (let pos of group)
        result = result.join(pos.conflicts());
      return result;
    }
    function compareRepeatPrec(a, b) {
      for (let pos of a)
        if (pos.rule.name.repeated) {
          for (let posB of b)
            if (posB.rule.name == pos.rule.name) {
              if (pos.rule.isRepeatWrap && pos.pos == 2)
                return 1;
              if (posB.rule.isRepeatWrap && posB.pos == 2)
                return -1;
            }
        }
      return 0;
    }
    function cmpStr(a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    function termsAhead(rule, pos, after, first) {
      let found = [];
      for (let i = pos + 1; i < rule.parts.length; i++) {
        let next = rule.parts[i], cont = false;
        if (next.terminal) {
          addTo(next, found);
        } else
          for (let term of first[next.name]) {
            if (term == null)
              cont = true;
            else
              addTo(term, found);
          }
        if (!cont)
          return found;
      }
      for (let a of after)
        addTo(a, found);
      return found;
    }
    function eqSet(a, b) {
      if (a.length != b.length)
        return false;
      for (let i = 0; i < a.length; i++)
        if (!a[i].eq(b[i]))
          return false;
      return true;
    }
    function sameSet(a, b) {
      if (a.length != b.length)
        return false;
      for (let i = 0; i < a.length; i++)
        if (a[i] != b[i])
          return false;
      return true;
    }
    var Shift = class _Shift {
      constructor(term, target) {
        this.term = term;
        this.target = target;
      }
      eq(other) {
        return other instanceof _Shift && this.term == other.term && other.target.id == this.target.id;
      }
      cmp(other) {
        return other instanceof Reduce ? -1 : this.term.id - other.term.id || this.target.id - other.target.id;
      }
      matches(other, mapping) {
        return other instanceof _Shift && mapping[other.target.id] == mapping[this.target.id];
      }
      toString() {
        return "s" + this.target.id;
      }
      map(mapping, states) {
        let mapped = states[mapping[this.target.id]];
        return mapped == this.target ? this : new _Shift(this.term, mapped);
      }
    };
    var Reduce = class _Reduce {
      constructor(term, rule) {
        this.term = term;
        this.rule = rule;
      }
      eq(other) {
        return other instanceof _Reduce && this.term == other.term && other.rule.sameReduce(this.rule);
      }
      cmp(other) {
        return other instanceof Shift ? 1 : this.term.id - other.term.id || this.rule.name.id - other.rule.name.id || this.rule.parts.length - other.rule.parts.length;
      }
      matches(other, mapping) {
        return other instanceof _Reduce && other.rule.sameReduce(this.rule);
      }
      toString() {
        return `${this.rule.name.name}(${this.rule.parts.length})`;
      }
      map() {
        return this;
      }
    };
    function hashPositions(set) {
      let h = 5381;
      for (let pos of set)
        h = hash(h, pos.hash);
      return h;
    }
    var ConflictContext = class {
      constructor(first) {
        this.first = first;
        this.conflicts = [];
      }
    };
    var State = class {
      constructor(id, set, flags = 0, skip, hash2 = hashPositions(set), startRule = null) {
        this.id = id;
        this.set = set;
        this.flags = flags;
        this.skip = skip;
        this.hash = hash2;
        this.startRule = startRule;
        this.actions = [];
        this.actionPositions = [];
        this.goto = [];
        this.tokenGroup = -1;
        this.defaultReduce = null;
        this._actionsByTerm = null;
      }
      toString() {
        let actions = this.actions.map((t) => t.term + "=" + t).join(",") + (this.goto.length ? " | " + this.goto.map((g) => g.term + "=" + g).join(",") : "");
        return this.id + ": " + this.set.filter((p2) => p2.pos > 0).join() + (this.defaultReduce ? `
  always ${this.defaultReduce.name}(${this.defaultReduce.parts.length})` : actions.length ? "\n  " + actions : "");
      }
      addActionInner(value, positions) {
        check: for (let i = 0; i < this.actions.length; i++) {
          let action = this.actions[i];
          if (action.term == value.term) {
            if (action.eq(value))
              return null;
            let fullPos = Pos.addOrigins(positions, this.set), actionFullPos = Pos.addOrigins(this.actionPositions[i], this.set);
            let conflicts = conflictsAt(fullPos), actionConflicts = conflictsAt(actionFullPos);
            let diff = compareRepeatPrec(fullPos, actionFullPos) || conflicts.precedence - actionConflicts.precedence;
            if (diff > 0) {
              this.actions.splice(i, 1);
              this.actionPositions.splice(i, 1);
              i--;
              continue check;
            } else if (diff < 0) {
              return null;
            } else if (conflicts.ambigGroups.some((g) => actionConflicts.ambigGroups.includes(g))) {
              continue check;
            } else {
              return action;
            }
          }
        }
        this.actions.push(value);
        this.actionPositions.push(positions);
        return null;
      }
      addAction(value, positions, context) {
        let conflict = this.addActionInner(value, positions);
        if (conflict) {
          let conflictPos = this.actionPositions[this.actions.indexOf(conflict)][0];
          let rules = [positions[0].rule.name, conflictPos.rule.name];
          if (context.conflicts.some((c) => c.rules.some((r) => rules.includes(r))))
            return;
          let error;
          if (conflict instanceof Shift)
            error = `shift/reduce conflict between
  ${conflictPos}
and
  ${positions[0].rule}`;
          else
            error = `reduce/reduce conflict between
  ${conflictPos.rule}
and
  ${positions[0].rule}`;
          error += `
With input:
  ${positions[0].trail(70)} \xB7 ${value.term} \u2026`;
          if (conflict instanceof Shift)
            error += findConflictShiftSource(positions[0], conflict.term, context.first);
          error += findConflictOrigin(conflictPos, positions[0]);
          context.conflicts.push(new Conflict(error, rules));
        }
      }
      getGoto(term) {
        return this.goto.find((a) => a.term == term);
      }
      hasSet(set) {
        return eqSet(this.set, set);
      }
      actionsByTerm() {
        let result = this._actionsByTerm;
        if (!result) {
          this._actionsByTerm = result = /* @__PURE__ */ Object.create(null);
          for (let action of this.actions)
            (result[action.term.id] || (result[action.term.id] = [])).push(action);
        }
        return result;
      }
      finish() {
        if (this.actions.length) {
          let first = this.actions[0];
          if (first instanceof Reduce) {
            let { rule } = first;
            if (this.actions.every((a) => a instanceof Reduce && a.rule.sameReduce(rule)))
              this.defaultReduce = rule;
          }
        }
        this.actions.sort((a, b) => a.cmp(b));
        this.goto.sort((a, b) => a.cmp(b));
      }
      eq(other) {
        let dThis = this.defaultReduce, dOther = other.defaultReduce;
        if (dThis || dOther)
          return dThis && dOther ? dThis.sameReduce(dOther) : false;
        return this.skip == other.skip && this.tokenGroup == other.tokenGroup && eqSet(this.actions, other.actions) && eqSet(this.goto, other.goto);
      }
    };
    function closure(set, first) {
      let added = [], redo = [];
      function addFor(name, ahead, ambigAhead, skipAhead, via) {
        for (let rule of name.rules) {
          let add = added.find((a) => a.rule == rule);
          if (!add) {
            let existing = set.find((p2) => p2.pos == 0 && p2.rule == rule);
            add = existing ? new Pos(rule, 0, existing.ahead.slice(), existing.ambigAhead, existing.skipAhead, existing.via) : new Pos(rule, 0, [], none$1, skipAhead, via);
            added.push(add);
          }
          if (add.skipAhead != skipAhead)
            throw new GenError("Inconsistent skip sets after " + via.trail());
          add.ambigAhead = union(add.ambigAhead, ambigAhead);
          for (let term of ahead)
            if (!add.ahead.includes(term)) {
              add.ahead.push(term);
              if (add.rule.parts.length && !add.rule.parts[0].terminal)
                addTo(add, redo);
            }
        }
      }
      for (let pos of set) {
        let next = pos.next;
        if (next && !next.terminal)
          addFor(next, termsAhead(pos.rule, pos.pos, pos.ahead, first), pos.conflicts(pos.pos + 1).ambigGroups, pos.pos == pos.rule.parts.length - 1 ? pos.skipAhead : pos.rule.skip, pos);
      }
      while (redo.length) {
        let add = redo.pop();
        addFor(add.rule.parts[0], termsAhead(add.rule, 0, add.ahead, first), union(add.rule.conflicts[1].ambigGroups, add.rule.parts.length == 1 ? add.ambigAhead : none$1), add.rule.parts.length == 1 ? add.skipAhead : add.rule.skip, add);
      }
      let result = set.slice();
      for (let add of added) {
        add.ahead.sort((a, b) => a.hash - b.hash);
        add.finish();
        let origIndex = set.findIndex((p2) => p2.pos == 0 && p2.rule == add.rule);
        if (origIndex > -1)
          result[origIndex] = add;
        else
          result.push(add);
      }
      return result.sort((a, b) => a.cmp(b));
    }
    function addTo(value, array) {
      if (!array.includes(value))
        array.push(value);
    }
    function computeFirstSets(terms) {
      let table = /* @__PURE__ */ Object.create(null);
      for (let t of terms.terms)
        if (!t.terminal)
          table[t.name] = [];
      for (; ; ) {
        let change = false;
        for (let nt of terms.terms)
          if (!nt.terminal)
            for (let rule of nt.rules) {
              let set = table[nt.name];
              let found = false, startLen = set.length;
              for (let part of rule.parts) {
                found = true;
                if (part.terminal) {
                  addTo(part, set);
                } else {
                  for (let t of table[part.name]) {
                    if (t == null)
                      found = false;
                    else
                      addTo(t, set);
                  }
                }
                if (found)
                  break;
              }
              if (!found)
                addTo(null, set);
              if (set.length > startLen)
                change = true;
            }
        if (!change)
          return table;
      }
    }
    var Core = class {
      constructor(set, state) {
        this.set = set;
        this.state = state;
      }
    };
    var Conflict = class {
      constructor(error, rules) {
        this.error = error;
        this.rules = rules;
      }
    };
    function findConflictOrigin(a, b) {
      if (a.eqSimple(b))
        return "";
      function via(root, start) {
        let hist = [];
        for (let p2 = start.via; !p2.eqSimple(root); p2 = p2.via)
          hist.push(p2);
        if (!hist.length)
          return "";
        hist.unshift(start);
        return hist.reverse().map((p2, i) => "\n" + "  ".repeat(i + 1) + (p2 == start ? "" : "via ") + p2).join("");
      }
      for (let p2 = a; p2; p2 = p2.via)
        for (let p22 = b; p22; p22 = p22.via) {
          if (p2.eqSimple(p22))
            return "\nShared origin: " + p2 + via(p2, a) + via(p2, b);
        }
      return "";
    }
    function findConflictShiftSource(conflictPos, termAfter, first) {
      let pos = conflictPos, path = [];
      for (; ; ) {
        for (let i = pos.pos - 1; i >= 0; i--)
          path.push(pos.rule.parts[i]);
        if (!pos.via)
          break;
        pos = pos.via;
      }
      path.reverse();
      let seen = /* @__PURE__ */ new Set();
      function explore(pos2, i, hasMatch) {
        if (i == path.length && hasMatch && !pos2.next)
          return `
The reduction of ${conflictPos.rule.name} is allowed before ${termAfter} because of this rule:
  ${hasMatch}`;
        for (let next; next = pos2.next; ) {
          if (i < path.length && next == path[i]) {
            let inner = explore(pos2.advance(), i + 1, hasMatch);
            if (inner)
              return inner;
          }
          let after = pos2.rule.parts[pos2.pos + 1], match = pos2.pos + 1 == pos2.rule.parts.length ? hasMatch : null;
          if (after && (after.terminal ? after == termAfter : first[after.name].includes(termAfter)))
            match = pos2.advance();
          for (let rule of next.rules) {
            let hash2 = (rule.id << 5) + i + (match ? 555 : 0);
            if (!seen.has(hash2)) {
              seen.add(hash2);
              let inner = explore(new Pos(rule, 0, [], [], next, pos2), i, match);
              if (inner)
                return inner;
            }
          }
          if (!next.terminal && first[next.name].includes(null))
            pos2 = pos2.advance();
          else
            break;
        }
        return "";
      }
      return explore(pos, 0, null);
    }
    function buildFullAutomaton(terms, startTerms, first) {
      let states = [], statesBySetHash = {};
      let cores = {};
      let t0 = Date.now();
      function getState(core, top) {
        if (core.length == 0)
          return null;
        let coreHash = hashPositions(core), byHash = cores[coreHash];
        let skip;
        for (let pos of core) {
          if (!skip)
            skip = pos.skip;
          else if (skip != pos.skip)
            throw new GenError("Inconsistent skip sets after " + pos.trail());
        }
        if (byHash) {
          for (let known of byHash)
            if (eqSet(core, known.set)) {
              if (known.state.skip != skip)
                throw new GenError("Inconsistent skip sets after " + known.set[0].trail());
              return known.state;
            }
        }
        let set = closure(core, first);
        let hash2 = hashPositions(set), forHash = statesBySetHash[hash2] || (statesBySetHash[hash2] = []);
        let found;
        if (!top) {
          for (let state of forHash)
            if (state.hasSet(set))
              found = state;
        }
        if (!found) {
          found = new State(states.length, set, 0, skip, hash2, top);
          forHash.push(found);
          states.push(found);
          if (timing && states.length % 500 == 0)
            console.log(`${states.length} states after ${((Date.now() - t0) / 1e3).toFixed(2)}s`);
        }
        (cores[coreHash] || (cores[coreHash] = [])).push(new Core(core, found));
        return found;
      }
      for (const startTerm of startTerms) {
        const startSkip = startTerm.rules.length ? startTerm.rules[0].skip : terms.names["%noskip"];
        getState(startTerm.rules.map((rule) => new Pos(rule, 0, [terms.eof], none$1, startSkip, null).finish()), startTerm);
      }
      let conflicts = new ConflictContext(first);
      for (let filled = 0; filled < states.length; filled++) {
        let state = states[filled];
        let byTerm = [], byTermPos = [], atEnd = [];
        for (let pos of state.set) {
          if (pos.pos == pos.rule.parts.length) {
            if (!pos.rule.name.top)
              atEnd.push(pos);
          } else {
            let next = pos.rule.parts[pos.pos];
            let index = byTerm.indexOf(next);
            if (index < 0) {
              byTerm.push(next);
              byTermPos.push([pos]);
            } else {
              byTermPos[index].push(pos);
            }
          }
        }
        for (let i = 0; i < byTerm.length; i++) {
          let term = byTerm[i], positions = byTermPos[i].map((p2) => p2.advance());
          if (term.terminal) {
            let set = applyCut(positions);
            let next = getState(set);
            if (next)
              state.addAction(new Shift(term, next), byTermPos[i], conflicts);
          } else {
            let goto = getState(positions);
            if (goto)
              state.goto.push(new Shift(term, goto));
          }
        }
        let replaced = false;
        for (let pos of atEnd)
          for (let ahead of pos.ahead) {
            let count = state.actions.length;
            state.addAction(new Reduce(ahead, pos.rule), [pos], conflicts);
            if (state.actions.length == count)
              replaced = true;
          }
        if (replaced)
          for (let i = 0; i < state.goto.length; i++) {
            let start = first[state.goto[i].term.name];
            if (!start.some((term) => state.actions.some((a) => a.term == term && a instanceof Shift)))
              state.goto.splice(i--, 1);
          }
      }
      if (conflicts.conflicts.length)
        throw new GenError(conflicts.conflicts.map((c) => c.error).join("\n\n"));
      for (let state of states)
        state.finish();
      if (timing)
        console.log(`${states.length} states total.`);
      return states;
    }
    function applyCut(set) {
      let found = null, cut = 1;
      for (let pos of set) {
        let value = pos.rule.conflicts[pos.pos - 1].cut;
        if (value < cut)
          continue;
        if (!found || value > cut) {
          cut = value;
          found = [];
        }
        found.push(pos);
      }
      return found || set;
    }
    function canMerge(a, b, mapping) {
      for (let goto of a.goto)
        for (let other of b.goto) {
          if (goto.term == other.term && mapping[goto.target.id] != mapping[other.target.id])
            return false;
        }
      let byTerm = b.actionsByTerm();
      for (let action of a.actions) {
        let setB = byTerm[action.term.id];
        if (setB && setB.some((other) => !other.matches(action, mapping))) {
          if (setB.length == 1)
            return false;
          let setA = a.actionsByTerm()[action.term.id];
          if (setA.length != setB.length || setA.some((a1) => !setB.some((a2) => a1.matches(a2, mapping))))
            return false;
        }
      }
      return true;
    }
    function mergeStates(states, mapping) {
      let newStates = [];
      for (let state of states) {
        let newID = mapping[state.id];
        if (!newStates[newID]) {
          newStates[newID] = new State(newID, state.set, 0, state.skip, state.hash, state.startRule);
          newStates[newID].tokenGroup = state.tokenGroup;
          newStates[newID].defaultReduce = state.defaultReduce;
        }
      }
      for (let state of states) {
        let newID = mapping[state.id], target = newStates[newID];
        target.flags |= state.flags;
        for (let i = 0; i < state.actions.length; i++) {
          let action = state.actions[i].map(mapping, newStates);
          if (!target.actions.some((a) => a.eq(action))) {
            target.actions.push(action);
            target.actionPositions.push(state.actionPositions[i]);
          }
        }
        for (let goto of state.goto) {
          let mapped = goto.map(mapping, newStates);
          if (!target.goto.some((g) => g.eq(mapped)))
            target.goto.push(mapped);
        }
      }
      return newStates;
    }
    var Group = class {
      constructor(origin, member) {
        this.origin = origin;
        this.members = [member];
      }
    };
    function samePosSet(a, b) {
      if (a.length != b.length)
        return false;
      for (let i = 0; i < a.length; i++)
        if (!a[i].eqSimple(b[i]))
          return false;
      return true;
    }
    function collapseAutomaton(states) {
      let mapping = [], groups = [];
      assignGroups: for (let i = 0; i < states.length; i++) {
        let state = states[i];
        if (!state.startRule)
          for (let j = 0; j < groups.length; j++) {
            let group = groups[j], other = states[group.members[0]];
            if (state.tokenGroup == other.tokenGroup && state.skip == other.skip && !other.startRule && samePosSet(state.set, other.set)) {
              group.members.push(i);
              mapping.push(j);
              continue assignGroups;
            }
          }
        mapping.push(groups.length);
        groups.push(new Group(groups.length, i));
      }
      function spill(groupIndex, index) {
        let group = groups[groupIndex], state = states[group.members[index]];
        let pop = group.members.pop();
        if (index != group.members.length)
          group.members[index] = pop;
        for (let i = groupIndex + 1; i < groups.length; i++) {
          mapping[state.id] = i;
          if (groups[i].origin == group.origin && groups[i].members.every((id) => canMerge(state, states[id], mapping))) {
            groups[i].members.push(state.id);
            return;
          }
        }
        mapping[state.id] = groups.length;
        groups.push(new Group(group.origin, state.id));
      }
      for (let pass = 1; ; pass++) {
        let conflicts = false, t0 = Date.now();
        for (let g = 0, startLen = groups.length; g < startLen; g++) {
          let group = groups[g];
          for (let i = 0; i < group.members.length - 1; i++) {
            for (let j = i + 1; j < group.members.length; j++) {
              let idA = group.members[i], idB = group.members[j];
              if (!canMerge(states[idA], states[idB], mapping)) {
                conflicts = true;
                spill(g, j--);
              }
            }
          }
        }
        if (timing)
          console.log(`Collapse pass ${pass}${conflicts ? `` : `, done`} (${((Date.now() - t0) / 1e3).toFixed(2)}s)`);
        if (!conflicts)
          return mergeStates(states, mapping);
      }
    }
    function mergeIdentical(states) {
      for (let pass = 1; ; pass++) {
        let mapping = [], didMerge = false, t0 = Date.now();
        let newStates = [];
        for (let i = 0; i < states.length; i++) {
          let state = states[i];
          let match = newStates.findIndex((s) => state.eq(s));
          if (match < 0) {
            mapping[i] = newStates.length;
            newStates.push(state);
          } else {
            mapping[i] = match;
            didMerge = true;
            let other = newStates[match], add = null;
            for (let pos of state.set)
              if (!other.set.some((p2) => p2.eqSimple(pos)))
                (add || (add = [])).push(pos);
            if (add)
              other.set = add.concat(other.set).sort((a, b) => a.cmp(b));
          }
        }
        if (timing)
          console.log(`Merge identical pass ${pass}${didMerge ? "" : ", done"} (${((Date.now() - t0) / 1e3).toFixed(2)}s)`);
        if (!didMerge)
          return states;
        for (let state of newStates)
          if (!state.defaultReduce) {
            state.actions = state.actions.map((a) => a.map(mapping, newStates));
            state.goto = state.goto.map((a) => a.map(mapping, newStates));
          }
        for (let i = 0; i < newStates.length; i++)
          newStates[i].id = i;
        states = newStates;
      }
    }
    var none$1 = [];
    function finishAutomaton(full) {
      return mergeIdentical(collapseAutomaton(full));
    }
    function digitToChar(digit) {
      let ch = digit + 32;
      if (ch >= 34)
        ch++;
      if (ch >= 92)
        ch++;
      return String.fromCharCode(ch);
    }
    function encode(value, max = 65535) {
      if (value > max)
        throw new Error("Trying to encode a number that's too big: " + value);
      if (value == 65535)
        return String.fromCharCode(
          126
          /* Encode.BigValCode */
        );
      let result = "";
      for (let first = 46; ; first = 0) {
        let low = value % 46, rest = value - low;
        result = digitToChar(low + first) + result;
        if (rest == 0)
          break;
        value = rest / 46;
      }
      return result;
    }
    function encodeArray(values, max = 65535) {
      let result = '"' + encode(values.length, 4294967295);
      for (let i = 0; i < values.length; i++)
        result += encode(values[i], max);
      result += '"';
      return result;
    }
    var none = [];
    var Parts = class _Parts {
      constructor(terms, conflicts) {
        this.terms = terms;
        this.conflicts = conflicts;
      }
      concat(other) {
        if (this == _Parts.none)
          return other;
        if (other == _Parts.none)
          return this;
        let conflicts = null;
        if (this.conflicts || other.conflicts) {
          conflicts = this.conflicts ? this.conflicts.slice() : this.ensureConflicts();
          let otherConflicts = other.ensureConflicts();
          conflicts[conflicts.length - 1] = conflicts[conflicts.length - 1].join(otherConflicts[0]);
          for (let i = 1; i < otherConflicts.length; i++)
            conflicts.push(otherConflicts[i]);
        }
        return new _Parts(this.terms.concat(other.terms), conflicts);
      }
      withConflicts(pos, conflicts) {
        if (conflicts == Conflicts.none)
          return this;
        let array = this.conflicts ? this.conflicts.slice() : this.ensureConflicts();
        array[pos] = array[pos].join(conflicts);
        return new _Parts(this.terms, array);
      }
      ensureConflicts() {
        if (this.conflicts)
          return this.conflicts;
        let empty = [];
        for (let i = 0; i <= this.terms.length; i++)
          empty.push(Conflicts.none);
        return empty;
      }
    };
    Parts.none = new Parts(none, null);
    function p(...terms) {
      return new Parts(terms, null);
    }
    var BuiltRule = class {
      constructor(id, args, term) {
        this.id = id;
        this.args = args;
        this.term = term;
      }
      matches(expr) {
        return this.id == expr.id.name && exprsEq(expr.args, this.args);
      }
      matchesRepeat(expr) {
        return this.id == "+" && exprEq(expr.expr, this.args[0]);
      }
    };
    var Builder = class {
      constructor(text, options) {
        this.options = options;
        this.terms = new TermSet();
        this.specialized = /* @__PURE__ */ Object.create(null);
        this.tokenOrigins = /* @__PURE__ */ Object.create(null);
        this.rules = [];
        this.built = [];
        this.ruleNames = /* @__PURE__ */ Object.create(null);
        this.namespaces = /* @__PURE__ */ Object.create(null);
        this.namedTerms = /* @__PURE__ */ Object.create(null);
        this.termTable = /* @__PURE__ */ Object.create(null);
        this.knownProps = /* @__PURE__ */ Object.create(null);
        this.dynamicRulePrecedences = [];
        this.definedGroups = [];
        this.astRules = [];
        this.currentSkip = [];
        time("Parse", () => {
          this.input = new Input(text, options.fileName);
          this.ast = this.input.parse();
        });
        let NP = common.NodeProp;
        for (let prop in NP) {
          if (NP[prop] instanceof common.NodeProp && !NP[prop].perNode)
            this.knownProps[prop] = { prop: NP[prop], source: { name: prop, from: null } };
        }
        for (let prop of this.ast.externalProps) {
          this.knownProps[prop.id.name] = {
            prop: this.options.externalProp ? this.options.externalProp(prop.id.name) : new common.NodeProp(),
            source: { name: prop.externalID.name, from: prop.source }
          };
        }
        this.dialects = this.ast.dialects.map((d) => d.name);
        this.tokens = new MainTokenSet(this, this.ast.tokens);
        this.localTokens = this.ast.localTokens.map((g) => new LocalTokenSet(this, g));
        this.externalTokens = this.ast.externalTokens.map((ext) => new ExternalTokenSet(this, ext));
        this.externalSpecializers = this.ast.externalSpecializers.map((decl) => new ExternalSpecializer(this, decl));
        time("Build rules", () => {
          let noSkip = this.newName("%noskip", true);
          this.defineRule(noSkip, []);
          let mainSkip = this.ast.mainSkip ? this.newName("%mainskip", true) : noSkip;
          let scopedSkip = [], topRules = [];
          for (let rule of this.ast.rules)
            this.astRules.push({ skip: mainSkip, rule });
          for (let rule of this.ast.topRules)
            topRules.push({ skip: mainSkip, rule });
          for (let scoped of this.ast.scopedSkip) {
            let skip = noSkip, found = this.ast.scopedSkip.findIndex((sc, i) => i < scopedSkip.length && exprEq(sc.expr, scoped.expr));
            if (found > -1)
              skip = scopedSkip[found];
            else if (this.ast.mainSkip && exprEq(scoped.expr, this.ast.mainSkip))
              skip = mainSkip;
            else if (!isEmpty(scoped.expr))
              skip = this.newName("%skip", true);
            scopedSkip.push(skip);
            for (let rule of scoped.rules)
              this.astRules.push({ skip, rule });
            for (let rule of scoped.topRules)
              topRules.push({ skip, rule });
          }
          for (let { rule } of this.astRules) {
            this.unique(rule.id);
          }
          this.currentSkip.push(noSkip);
          this.skipRules = mainSkip == noSkip ? [mainSkip] : [noSkip, mainSkip];
          if (mainSkip != noSkip)
            this.defineRule(mainSkip, this.normalizeExpr(this.ast.mainSkip));
          for (let i = 0; i < this.ast.scopedSkip.length; i++) {
            let skip = scopedSkip[i];
            if (!this.skipRules.includes(skip)) {
              this.skipRules.push(skip);
              if (skip != noSkip)
                this.defineRule(skip, this.normalizeExpr(this.ast.scopedSkip[i].expr));
            }
          }
          this.currentSkip.pop();
          for (let { rule, skip } of topRules.sort((a, b) => a.rule.start - b.rule.start)) {
            this.unique(rule.id);
            this.used(rule.id.name);
            this.currentSkip.push(skip);
            let { name, props } = this.nodeInfo(rule.props, "a", rule.id.name, none, none, rule.expr);
            let term = this.terms.makeTop(name, props);
            this.namedTerms[name] = term;
            this.defineRule(term, this.normalizeExpr(rule.expr));
            this.currentSkip.pop();
          }
          for (let ext of this.externalSpecializers)
            ext.finish();
          for (let { skip, rule } of this.astRules) {
            if (this.ruleNames[rule.id.name] && isExported(rule) && !rule.params.length) {
              this.buildRule(rule, [], skip, false);
              if (rule.expr instanceof SequenceExpression && rule.expr.exprs.length == 0)
                this.used(rule.id.name);
            }
          }
        });
        for (let name in this.ruleNames) {
          let value = this.ruleNames[name];
          if (value)
            this.warn(`Unused rule '${value.name}'`, value.start);
        }
        this.tokens.takePrecedences();
        this.tokens.takeConflicts();
        for (let lt of this.localTokens)
          lt.takePrecedences();
        for (let { name, group, rule } of this.definedGroups)
          this.defineGroup(name, group, rule);
        this.checkGroups();
      }
      unique(id) {
        if (id.name in this.ruleNames)
          this.raise(`Duplicate definition of rule '${id.name}'`, id.start);
        this.ruleNames[id.name] = id;
      }
      used(name) {
        this.ruleNames[name] = null;
      }
      newName(base, nodeName = null, props = {}) {
        for (let i = nodeName ? 0 : 1; ; i++) {
          let name = i ? `${base}-${i}` : base;
          if (!this.terms.names[name])
            return this.terms.makeNonTerminal(name, nodeName === true ? null : nodeName, props);
        }
      }
      prepareParser() {
        let rules = time("Simplify rules", () => simplifyRules(this.rules, [
          ...this.skipRules,
          ...this.terms.tops
        ]));
        let { nodeTypes, names: termNames, minRepeatTerm, maxTerm } = this.terms.finish(rules);
        for (let prop in this.namedTerms)
          this.termTable[prop] = this.namedTerms[prop].id;
        if (/\bgrammar\b/.test(verbose))
          console.log(rules.join("\n"));
        let startTerms = this.terms.tops.slice();
        let first = computeFirstSets(this.terms);
        let skipInfo = this.skipRules.map((name, id) => {
          let skip = [], startTokens = [], rules2 = [];
          for (let rule of name.rules) {
            if (!rule.parts.length)
              continue;
            let start = rule.parts[0];
            for (let t of start.terminal ? [start] : first[start.name] || [])
              if (t && !startTokens.includes(t))
                startTokens.push(t);
            if (start.terminal && rule.parts.length == 1 && !rules2.some((r) => r != rule && r.parts[0] == start))
              skip.push(start);
            else
              rules2.push(rule);
          }
          name.rules = rules2;
          if (rules2.length)
            startTerms.push(name);
          return { skip, rule: rules2.length ? name : null, startTokens, id };
        });
        let fullTable = time("Build full automaton", () => buildFullAutomaton(this.terms, startTerms, first));
        let localTokens = this.localTokens.map((grp, i) => grp.buildLocalGroup(fullTable, skipInfo, i));
        let { tokenGroups, tokenPrec, tokenData } = time("Build token groups", () => this.tokens.buildTokenGroups(fullTable, skipInfo, localTokens.length));
        for (let ext of this.externalTokens)
          ext.checkConflicts(fullTable, skipInfo);
        let table = time("Finish automaton", () => finishAutomaton(fullTable));
        let skipState = findSkipStates(table, this.terms.tops);
        if (/\blr\b/.test(verbose))
          console.log(table.join("\n"));
        let specialized = [];
        for (let ext of this.externalSpecializers)
          specialized.push(ext);
        for (let name in this.specialized)
          specialized.push({ token: this.terms.names[name], table: buildSpecializeTable(this.specialized[name]) });
        let tokStart = (tokenizer) => {
          if (tokenizer instanceof ExternalTokenSet)
            return tokenizer.ast.start;
          return this.tokens.ast ? this.tokens.ast.start : -1;
        };
        let tokenizers = tokenGroups.concat(this.externalTokens).sort((a, b) => tokStart(a) - tokStart(b)).concat(localTokens);
        let data = new DataBuilder();
        let skipData = skipInfo.map((info) => {
          let actions = [];
          for (let term of info.skip)
            actions.push(term.id, 0, 262144 >> 16);
          if (info.rule) {
            let state = table.find((s) => s.startRule == info.rule);
            for (let action of state.actions)
              actions.push(action.term.id, state.id, 131072 >> 16);
          }
          actions.push(
            65535,
            0
            /* Seq.Done */
          );
          return data.storeArray(actions);
        });
        let states = time("Finish states", () => {
          let states2 = new Uint32Array(
            table.length * 6
            /* ParseState.Size */
          );
          let forceReductions = this.computeForceReductions(table, skipInfo);
          let finishCx = new FinishStateContext(tokenizers, data, states2, skipData, skipInfo, table, this);
          for (let s of table)
            finishCx.finish(s, skipState(s.id), forceReductions[s.id]);
          return states2;
        });
        let dialects = /* @__PURE__ */ Object.create(null);
        for (let i = 0; i < this.dialects.length; i++)
          dialects[this.dialects[i]] = data.storeArray((this.tokens.byDialect[i] || none).map((t) => t.id).concat(
            65535
            /* Seq.End */
          ));
        let dynamicPrecedences = null;
        if (this.dynamicRulePrecedences.length) {
          dynamicPrecedences = /* @__PURE__ */ Object.create(null);
          for (let { rule, prec } of this.dynamicRulePrecedences)
            dynamicPrecedences[rule.id] = prec;
        }
        let topRules = /* @__PURE__ */ Object.create(null);
        for (let term of this.terms.tops)
          topRules[term.nodeName] = [table.find((state) => state.startRule == term).id, term.id];
        let precTable = data.storeArray(tokenPrec.concat(
          65535
          /* Seq.End */
        ));
        let { nodeProps, skippedTypes } = this.gatherNodeProps(nodeTypes);
        return {
          states,
          stateData: data.finish(),
          goto: computeGotoTable(table),
          nodeNames: nodeTypes.filter((t) => t.id < minRepeatTerm).map((t) => t.nodeName).join(" "),
          nodeProps,
          skippedTypes,
          maxTerm,
          repeatNodeCount: nodeTypes.length - minRepeatTerm,
          tokenizers,
          tokenData,
          topRules,
          dialects,
          dynamicPrecedences,
          specialized,
          tokenPrec: precTable,
          termNames
        };
      }
      getParser() {
        let { states, stateData, goto, nodeNames, nodeProps: rawNodeProps, skippedTypes, maxTerm, repeatNodeCount, tokenizers, tokenData, topRules, dialects, dynamicPrecedences, specialized: rawSpecialized, tokenPrec, termNames } = this.prepareParser();
        let specialized = rawSpecialized.map((v) => {
          if (v instanceof ExternalSpecializer) {
            let ext = this.options.externalSpecializer(v.ast.id.name, this.termTable);
            return {
              term: v.term.id,
              get: (value, stack) => ext(value, stack) << 1 | (v.ast.type == "extend" ? 1 : 0),
              external: ext,
              extend: v.ast.type == "extend"
            };
          } else {
            return { term: v.token.id, get: (value) => v.table[value] || -1 };
          }
        });
        return lr.LRParser.deserialize({
          version: 14,
          states,
          stateData,
          goto,
          nodeNames,
          maxTerm,
          repeatNodeCount,
          nodeProps: rawNodeProps.map(({ prop, terms }) => [this.knownProps[prop].prop, ...terms]),
          propSources: !this.options.externalPropSource ? void 0 : this.ast.externalPropSources.map((s) => this.options.externalPropSource(s.id.name)),
          skippedNodes: skippedTypes,
          tokenData,
          tokenizers: tokenizers.map((tok) => tok.create()),
          context: !this.ast.context ? void 0 : typeof this.options.contextTracker == "function" ? this.options.contextTracker(this.termTable) : this.options.contextTracker,
          topRules,
          dialects,
          dynamicPrecedences,
          specialized,
          tokenPrec,
          termNames
        });
      }
      getParserFile() {
        let { states, stateData, goto, nodeNames, nodeProps: rawNodeProps, skippedTypes, maxTerm, repeatNodeCount, tokenizers: rawTokenizers, tokenData, topRules, dialects: rawDialects, dynamicPrecedences, specialized: rawSpecialized, tokenPrec, termNames } = this.prepareParser();
        let mod = this.options.moduleStyle || "es";
        let gen = "// This file was generated by lezer-generator. You probably shouldn't edit it.\n", head = gen;
        let imports = {}, imported = /* @__PURE__ */ Object.create(null);
        let defined = /* @__PURE__ */ Object.create(null);
        for (let word2 of KEYWORDS)
          defined[word2] = true;
        let exportName = this.options.exportName || "parser";
        defined[exportName] = true;
        let getName = (prefix) => {
          for (let i = 0; ; i++) {
            let id = prefix + (i ? "_" + i : "");
            if (!defined[id])
              return id;
          }
        };
        let importName = (name, source, prefix = name) => {
          let spec = name + " from " + source;
          if (imported[spec])
            return imported[spec];
          let src = JSON.stringify(source), varName = name;
          if (name in defined) {
            varName = getName(prefix);
            name += `${mod == "cjs" ? ":" : " as"} ${varName}`;
          }
          defined[varName] = true;
          (imports[src] || (imports[src] = [])).push(name);
          return imported[spec] = varName;
        };
        let lrParser = importName("LRParser", "@lezer/lr");
        let tokenizers = rawTokenizers.map((tok) => tok.createSource(importName));
        let context = this.ast.context ? importName(this.ast.context.id.name, this.ast.context.source) : null;
        let nodeProps = rawNodeProps.map(({ prop, terms: terms2 }) => {
          let { source } = this.knownProps[prop];
          let propID = source.from ? importName(source.name, source.from) : JSON.stringify(source.name);
          return `[${propID}, ${terms2.map(serializePropValue).join(",")}]`;
        });
        function specializationTableString(table) {
          return "{__proto__:null," + Object.keys(table).map((key) => `${/^(\d+|[a-zA-Z_]\w*)$/.test(key) ? key : JSON.stringify(key)}:${table[key]}`).join(", ") + "}";
        }
        let specHead = "";
        let specialized = rawSpecialized.map((v) => {
          if (v instanceof ExternalSpecializer) {
            let name = importName(v.ast.id.name, v.ast.source);
            let ts = this.options.typeScript ? ": any" : "";
            return `{term: ${v.term.id}, get: (value${ts}, stack${ts}) => (${name}(value, stack) << 1)${v.ast.type == "extend" ? ` | ${1}` : ""}, external: ${name}${v.ast.type == "extend" ? ", extend: true" : ""}}`;
          } else {
            let tableName = getName("spec_" + v.token.name.replace(/\W/g, ""));
            defined[tableName] = true;
            specHead += `const ${tableName} = ${specializationTableString(v.table)}
`;
            let ts = this.options.typeScript ? `: keyof typeof ${tableName}` : "";
            return `{term: ${v.token.id}, get: (value${ts}) => ${tableName}[value] || -1}`;
          }
        });
        let propSources = this.ast.externalPropSources.map((s) => importName(s.id.name, s.source));
        for (let source in imports) {
          if (mod == "cjs")
            head += `const {${imports[source].join(", ")}} = require(${source})
`;
          else
            head += `import {${imports[source].join(", ")}} from ${source}
`;
        }
        head += specHead;
        function serializePropValue(value) {
          return typeof value != "string" || /^(true|false|\d+(\.\d+)?|\.\d+)$/.test(value) ? value : JSON.stringify(value);
        }
        let dialects = Object.keys(rawDialects).map((d) => `${d}: ${rawDialects[d]}`);
        let parserStr = `${lrParser}.deserialize({
  version: ${14},
  states: ${encodeArray(states, 4294967295)},
  stateData: ${encodeArray(stateData)},
  goto: ${encodeArray(goto)},
  nodeNames: ${JSON.stringify(nodeNames)},
  maxTerm: ${maxTerm}${context ? `,
  context: ${context}` : ""}${nodeProps.length ? `,
  nodeProps: [
    ${nodeProps.join(",\n    ")}
  ]` : ""}${propSources.length ? `,
  propSources: [${propSources.join()}]` : ""}${skippedTypes.length ? `,
  skippedNodes: ${JSON.stringify(skippedTypes)}` : ""},
  repeatNodeCount: ${repeatNodeCount},
  tokenData: ${encodeArray(tokenData)},
  tokenizers: [${tokenizers.join(", ")}],
  topRules: ${JSON.stringify(topRules)}${dialects.length ? `,
  dialects: {${dialects.join(", ")}}` : ""}${dynamicPrecedences ? `,
  dynamicPrecedences: ${JSON.stringify(dynamicPrecedences)}` : ""}${specialized.length ? `,
  specialized: [${specialized.join(",")}]` : ""},
  tokenPrec: ${tokenPrec}${this.options.includeNames ? `,
  termNames: ${JSON.stringify(termNames)}` : ""}
})`;
        let terms = [];
        for (let name in this.termTable) {
          let id = name;
          if (KEYWORDS.includes(id))
            for (let i = 1; ; i++) {
              id = "_".repeat(i) + name;
              if (!(id in this.termTable))
                break;
            }
          else if (!/^[\w$]+$/.test(name)) {
            continue;
          }
          terms.push(`${id}${mod == "cjs" ? ":" : " ="} ${this.termTable[name]}`);
        }
        for (let id = 0; id < this.dialects.length; id++)
          terms.push(`Dialect_${this.dialects[id]}${mod == "cjs" ? ":" : " ="} ${id}`);
        return {
          parser: head + (mod == "cjs" ? `exports.${exportName} = ${parserStr}
` : `export const ${exportName} = ${parserStr}
`),
          terms: mod == "cjs" ? `${gen}module.exports = {
  ${terms.join(",\n  ")}
}` : `${gen}export const
  ${terms.join(",\n  ")}
`
        };
      }
      gatherNonSkippedNodes() {
        let seen = /* @__PURE__ */ Object.create(null);
        let work = [];
        let add = (term) => {
          if (!seen[term.id]) {
            seen[term.id] = true;
            work.push(term);
          }
        };
        this.terms.tops.forEach(add);
        for (let i = 0; i < work.length; i++) {
          for (let rule of work[i].rules)
            for (let part of rule.parts)
              add(part);
        }
        return seen;
      }
      gatherNodeProps(nodeTypes) {
        let notSkipped = this.gatherNonSkippedNodes(), skippedTypes = [];
        let nodeProps = [];
        for (let type of nodeTypes) {
          if (!notSkipped[type.id] && !type.error)
            skippedTypes.push(type.id);
          for (let prop in type.props) {
            let known = this.knownProps[prop];
            if (!known)
              throw new GenError("No known prop type for " + prop);
            if (known.source.from == null && (known.source.name == "repeated" || known.source.name == "error"))
              continue;
            let rec = nodeProps.find((r) => r.prop == prop);
            if (!rec)
              nodeProps.push(rec = { prop, values: {} });
            (rec.values[type.props[prop]] || (rec.values[type.props[prop]] = [])).push(type.id);
          }
        }
        return {
          nodeProps: nodeProps.map(({ prop, values }) => {
            let terms = [];
            for (let val in values) {
              let ids2 = values[val];
              if (ids2.length == 1) {
                terms.push(ids2[0], val);
              } else {
                terms.push(-ids2.length);
                for (let id of ids2)
                  terms.push(id);
                terms.push(val);
              }
            }
            return { prop, terms };
          }),
          skippedTypes
        };
      }
      makeTerminal(name, tag, props) {
        return this.terms.makeTerminal(this.terms.uniqueName(name), tag, props);
      }
      computeForceReductions(states, skipInfo) {
        let reductions = [];
        let candidates = [];
        let gotoEdges = /* @__PURE__ */ Object.create(null);
        for (let state of states) {
          reductions.push(0);
          for (let edge of state.goto) {
            let array = gotoEdges[edge.term.id] || (gotoEdges[edge.term.id] = []);
            let found = array.find((o) => o.target == edge.target.id);
            if (found)
              found.parents.push(state.id);
            else
              array.push({ parents: [state.id], target: edge.target.id });
          }
          candidates[state.id] = state.set.filter((pos) => pos.pos > 0 && !pos.rule.name.top).sort((a, b) => b.pos - a.pos || a.rule.parts.length - b.rule.parts.length);
        }
        let length1Reductions = /* @__PURE__ */ Object.create(null);
        function createsCycle(term, startState, parents = null) {
          let edges = gotoEdges[term];
          if (!edges)
            return false;
          return edges.some((val) => {
            let parentIntersection = parents ? parents.filter((id) => val.parents.includes(id)) : val.parents;
            if (parentIntersection.length == 0)
              return false;
            if (val.target == startState)
              return true;
            let found = length1Reductions[val.target];
            return found != null && createsCycle(found, startState, parentIntersection);
          });
        }
        for (let state of states) {
          if (state.defaultReduce && state.defaultReduce.parts.length > 0) {
            reductions[state.id] = reduceAction(state.defaultReduce, skipInfo);
            if (state.defaultReduce.parts.length == 1)
              length1Reductions[state.id] = state.defaultReduce.name.id;
          }
        }
        for (let setSize = 1; ; setSize++) {
          let done = true;
          for (let state of states) {
            if (state.defaultReduce)
              continue;
            let set = candidates[state.id];
            if (set.length != setSize) {
              if (set.length > setSize)
                done = false;
              continue;
            }
            for (let pos of set) {
              if (pos.pos != 1 || !createsCycle(pos.rule.name.id, state.id)) {
                reductions[state.id] = reduceAction(pos.rule, skipInfo, pos.pos);
                if (pos.pos == 1)
                  length1Reductions[state.id] = pos.rule.name.id;
                break;
              }
            }
          }
          if (done)
            break;
        }
        return reductions;
      }
      substituteArgs(expr, args, params) {
        if (args.length == 0)
          return expr;
        return expr.walk((expr2) => {
          let found;
          if (expr2 instanceof NameExpression && (found = params.findIndex((p2) => p2.name == expr2.id.name)) > -1) {
            let arg = args[found];
            if (expr2.args.length) {
              if (arg instanceof NameExpression && !arg.args.length)
                return new NameExpression(expr2.start, arg.id, expr2.args);
              this.raise(`Passing arguments to a parameter that already has arguments`, expr2.start);
            }
            return arg;
          } else if (expr2 instanceof InlineRuleExpression) {
            let r = expr2.rule, props = this.substituteArgsInProps(r.props, args, params);
            return props == r.props ? expr2 : new InlineRuleExpression(expr2.start, new RuleDeclaration(r.start, r.id, props, r.params, r.expr));
          } else if (expr2 instanceof SpecializeExpression) {
            let props = this.substituteArgsInProps(expr2.props, args, params);
            return props == expr2.props ? expr2 : new SpecializeExpression(expr2.start, expr2.type, props, expr2.token, expr2.content);
          }
          return expr2;
        });
      }
      substituteArgsInProps(props, args, params) {
        let substituteInValue = (value) => {
          let result2 = value;
          for (let i = 0; i < value.length; i++) {
            let part = value[i];
            if (!part.name)
              continue;
            let found = params.findIndex((p2) => p2.name == part.name);
            if (found < 0)
              continue;
            if (result2 == value)
              result2 = value.slice();
            let expr = args[found];
            if (expr instanceof NameExpression && !expr.args.length)
              result2[i] = new PropPart(part.start, expr.id.name, null);
            else if (expr instanceof LiteralExpression)
              result2[i] = new PropPart(part.start, expr.value, null);
            else
              this.raise(`Trying to interpolate expression '${expr}' into a prop`, part.start);
          }
          return result2;
        };
        let result = props;
        for (let i = 0; i < props.length; i++) {
          let prop = props[i], value = substituteInValue(prop.value);
          if (value != prop.value) {
            if (result == props)
              result = props.slice();
            result[i] = new Prop(prop.start, prop.at, prop.name, value);
          }
        }
        return result;
      }
      conflictsFor(markers) {
        let here = Conflicts.none, atEnd = Conflicts.none;
        for (let marker of markers) {
          if (marker.type == "ambig") {
            here = here.join(new Conflicts(0, [marker.id.name]));
          } else {
            let precs = this.ast.precedences;
            let index = precs ? precs.items.findIndex((item) => item.id.name == marker.id.name) : -1;
            if (index < 0)
              this.raise(`Reference to unknown precedence: '${marker.id.name}'`, marker.id.start);
            let prec = precs.items[index], value = precs.items.length - index;
            if (prec.type == "cut") {
              here = here.join(new Conflicts(0, none, value));
            } else {
              here = here.join(new Conflicts(value << 2));
              atEnd = atEnd.join(new Conflicts((value << 2) + (prec.type == "left" ? 1 : prec.type == "right" ? -1 : 0)));
            }
          }
        }
        return { here, atEnd };
      }
      raise(message, pos = 1) {
        return this.input.raise(message, pos);
      }
      warn(message, pos = -1) {
        let msg = this.input.message(message, pos);
        if (this.options.warn)
          this.options.warn(msg);
        else
          console.warn(msg);
      }
      defineRule(name, choices) {
        let skip = this.currentSkip[this.currentSkip.length - 1];
        for (let choice of choices)
          this.rules.push(new Rule(name, choice.terms, choice.ensureConflicts(), skip));
      }
      resolve(expr) {
        for (let built of this.built)
          if (built.matches(expr))
            return [p(built.term)];
        let found = this.tokens.getToken(expr);
        if (found)
          return [p(found)];
        for (let grp of this.localTokens) {
          let found2 = grp.getToken(expr);
          if (found2)
            return [p(found2)];
        }
        for (let ext of this.externalTokens) {
          let found2 = ext.getToken(expr);
          if (found2)
            return [p(found2)];
        }
        for (let ext of this.externalSpecializers) {
          let found2 = ext.getToken(expr);
          if (found2)
            return [p(found2)];
        }
        let known = this.astRules.find((r) => r.rule.id.name == expr.id.name);
        if (!known)
          return this.raise(`Reference to undefined rule '${expr.id.name}'`, expr.start);
        if (known.rule.params.length != expr.args.length)
          this.raise(`Wrong number or arguments for '${expr.id.name}'`, expr.start);
        this.used(known.rule.id.name);
        return [p(this.buildRule(known.rule, expr.args, known.skip))];
      }
      // For tree-balancing reasons, repeat expressions X+ have to be
      // normalized to something like
      //
      //     R -> X | R R
      //
      // Returns the `R` term.
      normalizeRepeat(expr) {
        let known = this.built.find((b) => b.matchesRepeat(expr));
        if (known)
          return p(known.term);
        let name = expr.expr.prec < expr.prec ? `(${expr.expr})+` : `${expr.expr}+`;
        let term = this.terms.makeRepeat(this.terms.uniqueName(name));
        this.built.push(new BuiltRule("+", [expr.expr], term));
        this.defineRule(term, this.normalizeExpr(expr.expr).concat(p(term, term)));
        return p(term);
      }
      normalizeSequence(expr) {
        let result = expr.exprs.map((e) => this.normalizeExpr(e));
        let builder = this;
        function complete(start, from, endConflicts) {
          let { here, atEnd } = builder.conflictsFor(expr.markers[from]);
          if (from == result.length)
            return [start.withConflicts(start.terms.length, here.join(endConflicts))];
          let choices = [];
          for (let choice of result[from]) {
            for (let full of complete(start.concat(choice).withConflicts(start.terms.length, here), from + 1, endConflicts.join(atEnd)))
              choices.push(full);
          }
          return choices;
        }
        return complete(Parts.none, 0, Conflicts.none);
      }
      normalizeExpr(expr) {
        if (expr instanceof RepeatExpression && expr.kind == "?") {
          return [Parts.none, ...this.normalizeExpr(expr.expr)];
        } else if (expr instanceof RepeatExpression) {
          let repeated = this.normalizeRepeat(expr);
          return expr.kind == "+" ? [repeated] : [Parts.none, repeated];
        } else if (expr instanceof ChoiceExpression) {
          return expr.exprs.reduce((o, e) => o.concat(this.normalizeExpr(e)), []);
        } else if (expr instanceof SequenceExpression) {
          return this.normalizeSequence(expr);
        } else if (expr instanceof LiteralExpression) {
          return [p(this.tokens.getLiteral(expr))];
        } else if (expr instanceof NameExpression) {
          return this.resolve(expr);
        } else if (expr instanceof SpecializeExpression) {
          return [p(this.resolveSpecialization(expr))];
        } else if (expr instanceof InlineRuleExpression) {
          return [p(this.buildRule(expr.rule, none, this.currentSkip[this.currentSkip.length - 1], true))];
        } else {
          return this.raise(`This type of expression ('${expr}') may not occur in non-token rules`, expr.start);
        }
      }
      buildRule(rule, args, skip, inline = false) {
        let expr = this.substituteArgs(rule.expr, args, rule.params);
        let { name: nodeName, props, dynamicPrec, inline: explicitInline, group, exported } = this.nodeInfo(rule.props || none, inline ? "pg" : "pgi", rule.id.name, args, rule.params, rule.expr);
        if (exported && rule.params.length)
          this.warn(`Can't export parameterized rules`, rule.start);
        if (exported && inline)
          this.warn(`Can't export inline rule`, rule.start);
        let name = this.newName(rule.id.name + (args.length ? "<" + args.join(",") + ">" : ""), nodeName || true, props);
        if (explicitInline)
          name.inline = true;
        if (dynamicPrec)
          this.registerDynamicPrec(name, dynamicPrec);
        if ((name.nodeType || exported) && rule.params.length == 0) {
          if (!nodeName)
            name.preserve = true;
          if (!inline)
            this.namedTerms[exported || rule.id.name] = name;
        }
        if (!inline)
          this.built.push(new BuiltRule(rule.id.name, args, name));
        this.currentSkip.push(skip);
        let parts = this.normalizeExpr(expr);
        if (parts.length > 100 * (expr instanceof ChoiceExpression ? expr.exprs.length : 1))
          this.warn(`Rule ${rule.id.name} is generating a lot (${parts.length}) of choices.
  Consider splitting it up or reducing the amount of ? or | operator uses.`, rule.start);
        if (/\brulesize\b/.test(verbose) && parts.length > 10)
          console.log(`Rule ${rule.id.name}: ${parts.length} variants`);
        this.defineRule(name, parts);
        this.currentSkip.pop();
        if (group)
          this.definedGroups.push({ name, group, rule });
        return name;
      }
      nodeInfo(props, allow, defaultName = null, args = none, params = none, expr, defaultProps) {
        let result = {};
        let name = defaultName && (allow.indexOf("a") > -1 || !ignored(defaultName)) && !/ /.test(defaultName) ? defaultName : null;
        let dialect = null, dynamicPrec = 0, inline = false, group = null, exported = null;
        for (let prop of props) {
          if (!prop.at) {
            if (!this.knownProps[prop.name]) {
              let builtin = ["name", "dialect", "dynamicPrecedence", "export", "isGroup"].includes(prop.name) ? ` (did you mean '@${prop.name}'?)` : "";
              this.raise(`Unknown prop name '${prop.name}'${builtin}`, prop.start);
            }
            result[prop.name] = this.finishProp(prop, args, params);
          } else if (prop.name == "name") {
            name = this.finishProp(prop, args, params);
            if (/ /.test(name))
              this.raise(`Node names cannot have spaces ('${name}')`, prop.start);
          } else if (prop.name == "dialect") {
            if (allow.indexOf("d") < 0)
              this.raise("Can't specify a dialect on non-token rules", props[0].start);
            if (prop.value.length != 1 && !prop.value[0].value)
              this.raise("The '@dialect' rule prop must hold a plain string value");
            let dialectID = this.dialects.indexOf(prop.value[0].value);
            if (dialectID < 0)
              this.raise(`Unknown dialect '${prop.value[0].value}'`, prop.value[0].start);
            dialect = dialectID;
          } else if (prop.name == "dynamicPrecedence") {
            if (allow.indexOf("p") < 0)
              this.raise("Dynamic precedence can only be specified on nonterminals");
            if (prop.value.length != 1 || !/^-?(?:10|\d)$/.test(prop.value[0].value))
              this.raise("The '@dynamicPrecedence' rule prop must hold an integer between -10 and 10");
            dynamicPrec = +prop.value[0].value;
          } else if (prop.name == "inline") {
            if (prop.value.length)
              this.raise("'@inline' doesn't take a value", prop.value[0].start);
            if (allow.indexOf("i") < 0)
              this.raise("Inline can only be specified on nonterminals");
            inline = true;
          } else if (prop.name == "isGroup") {
            if (allow.indexOf("g") < 0)
              this.raise("'@isGroup' can only be specified on nonterminals");
            group = prop.value.length ? this.finishProp(prop, args, params) : defaultName;
          } else if (prop.name == "export") {
            if (prop.value.length)
              exported = this.finishProp(prop, args, params);
            else
              exported = defaultName;
          } else {
            this.raise(`Unknown built-in prop name '@${prop.name}'`, prop.start);
          }
        }
        if (expr && this.ast.autoDelim && (name || hasProps(result))) {
          let delim = this.findDelimiters(expr);
          if (delim) {
            addToProp(delim[0], "closedBy", delim[1].nodeName);
            addToProp(delim[1], "openedBy", delim[0].nodeName);
          }
        }
        if (defaultProps && hasProps(defaultProps)) {
          for (let prop in defaultProps)
            if (!(prop in result))
              result[prop] = defaultProps[prop];
        }
        if (hasProps(result) && !name)
          this.raise(`Node has properties but no name`, props.length ? props[0].start : expr.start);
        if (inline && (hasProps(result) || dialect || dynamicPrec))
          this.raise(`Inline nodes can't have props, dynamic precedence, or a dialect`, props[0].start);
        if (inline && name)
          name = null;
        return { name, props: result, dialect, dynamicPrec, inline, group, exported };
      }
      finishProp(prop, args, params) {
        return prop.value.map((part) => {
          if (part.value)
            return part.value;
          let pos = params.findIndex((param) => param.name == part.name);
          if (pos < 0)
            this.raise(`Property refers to '${part.name}', but no parameter by that name is in scope`, part.start);
          let expr = args[pos];
          if (expr instanceof NameExpression && !expr.args.length)
            return expr.id.name;
          if (expr instanceof LiteralExpression)
            return expr.value;
          return this.raise(`Expression '${expr}' can not be used as part of a property value`, part.start);
        }).join("");
      }
      resolveSpecialization(expr) {
        let type = expr.type;
        let { name, props, dialect, exported } = this.nodeInfo(expr.props, "d");
        let terminal = this.normalizeExpr(expr.token);
        if (terminal.length != 1 || terminal[0].terms.length != 1 || !terminal[0].terms[0].terminal)
          this.raise(`The first argument to '${type}' must resolve to a token`, expr.token.start);
        let values, lit;
        if ((lit = isLiteralToken(expr.content)) != null)
          values = [lit];
        else if (expr.content instanceof ChoiceExpression && expr.content.exprs.every((e) => isLiteralToken(e) != null))
          values = expr.content.exprs.map(isLiteralToken);
        else
          return this.raise(`The second argument to '${expr.type}' must be a literal or choice of literals`, expr.content.start);
        let term = terminal[0].terms[0], token = null;
        let table = this.specialized[term.name] || (this.specialized[term.name] = []);
        for (let value of values) {
          let known = table.find((sp) => sp.value == value);
          if (known == null) {
            if (!token) {
              token = this.makeTerminal(term.name + "/" + JSON.stringify(value), name, props);
              if (dialect != null)
                (this.tokens.byDialect[dialect] || (this.tokens.byDialect[dialect] = [])).push(token);
            }
            table.push({ value, term: token, type, dialect, name });
            this.tokenOrigins[token.name] = { spec: term };
            if (name || exported) {
              if (!name)
                token.preserve = true;
              this.namedTerms[exported || name] = token;
            }
          } else {
            if (known.type != type)
              this.raise(`Conflicting specialization types for ${JSON.stringify(value)} of ${term.name} (${type} vs ${known.type})`, expr.start);
            if (known.dialect != dialect)
              this.raise(`Conflicting dialects for specialization ${JSON.stringify(value)} of ${term.name}`, expr.start);
            if (known.name != name)
              this.raise(`Conflicting names for specialization ${JSON.stringify(value)} of ${term.name}`, expr.start);
            if (token && known.term != token)
              this.raise(`Conflicting specialization tokens for ${JSON.stringify(value)} of ${term.name}`, expr.start);
            token = known.term;
          }
        }
        return token;
      }
      findDelimiters(expr) {
        if (!(expr instanceof SequenceExpression) || expr.exprs.length < 2)
          return null;
        let findToken = (expr2) => {
          if (expr2 instanceof LiteralExpression)
            return { term: this.tokens.getLiteral(expr2), str: expr2.value };
          if (expr2 instanceof NameExpression && expr2.args.length == 0) {
            let rule = this.ast.rules.find((r) => r.id.name == expr2.id.name);
            if (rule)
              return findToken(rule.expr);
            let token = this.tokens.rules.find((r) => r.id.name == expr2.id.name);
            if (token && token.expr instanceof LiteralExpression)
              return { term: this.tokens.getToken(expr2), str: token.expr.value };
          }
          return null;
        };
        let lastToken = findToken(expr.exprs[expr.exprs.length - 1]);
        if (!lastToken || !lastToken.term.nodeName)
          return null;
        const brackets = ["()", "[]", "{}", "<>"];
        let bracket = brackets.find((b) => lastToken.str.indexOf(b[1]) > -1 && lastToken.str.indexOf(b[0]) < 0);
        if (!bracket)
          return null;
        let firstToken = findToken(expr.exprs[0]);
        if (!firstToken || !firstToken.term.nodeName || firstToken.str.indexOf(bracket[0]) < 0 || firstToken.str.indexOf(bracket[1]) > -1)
          return null;
        return [firstToken.term, lastToken.term];
      }
      registerDynamicPrec(term, prec) {
        this.dynamicRulePrecedences.push({ rule: term, prec });
        term.preserve = true;
      }
      defineGroup(rule, group, ast) {
        var _a;
        let recur = [];
        let getNamed = (rule2) => {
          if (rule2.nodeName)
            return [rule2];
          if (recur.includes(rule2))
            this.raise(`Rule '${ast.id.name}' cannot define a group because it contains a non-named recursive rule ('${rule2.name}')`, ast.start);
          let result = [];
          recur.push(rule2);
          for (let r of this.rules)
            if (r.name == rule2) {
              let names = r.parts.map(getNamed).filter((x) => x.length);
              if (names.length > 1)
                this.raise(`Rule '${ast.id.name}' cannot define a group because some choices produce multiple named nodes`, ast.start);
              if (names.length == 1)
                for (let n of names[0])
                  result.push(n);
            }
          recur.pop();
          return result;
        };
        for (let name of getNamed(rule))
          name.props["group"] = (((_a = name.props["group"]) === null || _a === void 0 ? void 0 : _a.split(" ")) || []).concat(group).sort().join(" ");
      }
      checkGroups() {
        let groups = /* @__PURE__ */ Object.create(null), nodeNames = /* @__PURE__ */ Object.create(null);
        for (let term of this.terms.terms)
          if (term.nodeName) {
            nodeNames[term.nodeName] = true;
            if (term.props["group"])
              for (let group of term.props["group"].split(" ")) {
                (groups[group] || (groups[group] = [])).push(term);
              }
          }
        let names = Object.keys(groups);
        for (let i = 0; i < names.length; i++) {
          let name = names[i], terms = groups[name];
          if (nodeNames[name])
            this.warn(`Group name '${name}' conflicts with a node of the same name`);
          for (let j = i + 1; j < names.length; j++) {
            let other = groups[names[j]];
            if (terms.some((t) => other.includes(t)) && (terms.length > other.length ? other.some((t) => !terms.includes(t)) : terms.some((t) => !other.includes(t))))
              this.warn(`Groups '${name}' and '${names[j]}' overlap without one being a superset of the other`);
          }
        }
      }
    };
    function isLiteralToken(expr) {
      if (expr instanceof LiteralExpression)
        return expr.value;
      if (expr instanceof SequenceExpression) {
        let result = "";
        for (let sub of expr.exprs) {
          let lit = isLiteralToken(sub);
          if (lit == null)
            return null;
          result += lit;
        }
        return result;
      }
      return null;
    }
    var MinSharedActions = 5;
    var FinishStateContext = class {
      constructor(tokenizers, data, stateArray, skipData, skipInfo, states, builder) {
        this.tokenizers = tokenizers;
        this.data = data;
        this.stateArray = stateArray;
        this.skipData = skipData;
        this.skipInfo = skipInfo;
        this.states = states;
        this.builder = builder;
        this.sharedActions = [];
      }
      findSharedActions(state) {
        if (state.actions.length < MinSharedActions)
          return null;
        let found = null;
        for (let shared of this.sharedActions) {
          if ((!found || shared.actions.length > found.actions.length) && shared.actions.every((a) => state.actions.some((b) => b.eq(a))))
            found = shared;
        }
        if (found)
          return found;
        let max = null, scratch = [];
        for (let i = state.id + 1; i < this.states.length; i++) {
          let other = this.states[i], fill = 0;
          if (other.defaultReduce || other.actions.length < MinSharedActions)
            continue;
          for (let a of state.actions)
            for (let b of other.actions)
              if (a.eq(b))
                scratch[fill++] = a;
          if (fill >= MinSharedActions && (!max || max.length < fill)) {
            max = scratch;
            scratch = [];
          }
        }
        if (!max)
          return null;
        let result = { actions: max, addr: this.storeActions(max, -1, null) };
        this.sharedActions.push(result);
        return result;
      }
      storeActions(actions, skipReduce, shared) {
        if (skipReduce < 0 && shared && shared.actions.length == actions.length)
          return shared.addr;
        let data = [];
        for (let action of actions) {
          if (shared && shared.actions.some((a) => a.eq(action)))
            continue;
          if (action instanceof Shift) {
            data.push(action.term.id, action.target.id, 0);
          } else {
            let code = reduceAction(action.rule, this.skipInfo);
            if (code != skipReduce)
              data.push(action.term.id, code & 65535, code >> 16);
          }
        }
        data.push(
          65535
          /* Seq.End */
        );
        if (skipReduce > -1)
          data.push(2, skipReduce & 65535, skipReduce >> 16);
        else if (shared)
          data.push(1, shared.addr & 65535, shared.addr >> 16);
        else
          data.push(
            0
            /* Seq.Done */
          );
        return this.data.storeArray(data);
      }
      finish(state, isSkip, forcedReduce) {
        let b = this.builder;
        let skipID = b.skipRules.indexOf(state.skip);
        let skipTable = this.skipData[skipID], skipTerms = this.skipInfo[skipID].startTokens;
        let defaultReduce = state.defaultReduce ? reduceAction(state.defaultReduce, this.skipInfo) : 0;
        let flags = isSkip ? 1 : 0;
        let skipReduce = -1, shared = null;
        if (defaultReduce == 0) {
          if (isSkip) {
            for (const action of state.actions)
              if (action instanceof Reduce && action.term.eof)
                skipReduce = reduceAction(action.rule, this.skipInfo);
          }
          if (skipReduce < 0)
            shared = this.findSharedActions(state);
        }
        if (state.set.some((p2) => p2.rule.name.top && p2.pos == p2.rule.parts.length))
          flags |= 2;
        let external = [];
        for (let i = 0; i < state.actions.length + skipTerms.length; i++) {
          let term = i < state.actions.length ? state.actions[i].term : skipTerms[i - state.actions.length];
          for (; ; ) {
            let orig = b.tokenOrigins[term.name];
            if (orig && orig.spec) {
              term = orig.spec;
              continue;
            }
            if (orig && orig.external instanceof ExternalTokenSet)
              addToSet(external, orig.external);
            break;
          }
        }
        let tokenizerMask = 0;
        for (let i = 0; i < this.tokenizers.length; i++) {
          let tok = this.tokenizers[i];
          if (external.includes(tok) || tok.groupID == state.tokenGroup)
            tokenizerMask |= 1 << i;
        }
        let base = state.id * 6;
        this.stateArray[
          base + 0
          /* ParseState.Flags */
        ] = flags;
        this.stateArray[
          base + 1
          /* ParseState.Actions */
        ] = this.storeActions(defaultReduce ? none : state.actions, skipReduce, shared);
        this.stateArray[
          base + 2
          /* ParseState.Skip */
        ] = skipTable;
        this.stateArray[
          base + 3
          /* ParseState.TokenizerMask */
        ] = tokenizerMask;
        this.stateArray[
          base + 4
          /* ParseState.DefaultReduce */
        ] = defaultReduce;
        this.stateArray[
          base + 5
          /* ParseState.ForcedReduce */
        ] = forcedReduce;
      }
    };
    function addToProp(term, prop, value) {
      let cur = term.props[prop];
      if (!cur || cur.split(" ").indexOf(value) < 0)
        term.props[prop] = cur ? cur + " " + value : value;
    }
    function buildSpecializeTable(spec) {
      let table = /* @__PURE__ */ Object.create(null);
      for (let { value, term, type } of spec) {
        let code = type == "specialize" ? 0 : 1;
        table[value] = term.id << 1 | code;
      }
      return table;
    }
    function reduceAction(rule, skipInfo, depth = rule.parts.length) {
      return rule.name.id | 65536 | (rule.isRepeatWrap && depth == rule.parts.length ? 131072 : 0) | (skipInfo.some((i) => i.rule == rule.name) ? 262144 : 0) | depth << 19;
    }
    function findArray(data, value) {
      search: for (let i = 0; ; ) {
        let next = data.indexOf(value[0], i);
        if (next == -1 || next + value.length > data.length)
          break;
        for (let j = 1; j < value.length; j++) {
          if (value[j] != data[next + j]) {
            i = next + 1;
            continue search;
          }
        }
        return next;
      }
      return -1;
    }
    function findSkipStates(table, startRules) {
      let nonSkip = /* @__PURE__ */ Object.create(null);
      let work = [];
      let add = (state) => {
        if (!nonSkip[state.id]) {
          nonSkip[state.id] = true;
          work.push(state);
        }
      };
      for (let state of table)
        if (state.startRule && startRules.includes(state.startRule))
          add(state);
      for (let i = 0; i < work.length; i++) {
        for (let a of work[i].actions)
          if (a instanceof Shift)
            add(a.target);
        for (let a of work[i].goto)
          add(a.target);
      }
      return (id) => !nonSkip[id];
    }
    var DataBuilder = class {
      constructor() {
        this.data = [];
      }
      storeArray(data) {
        let found = findArray(this.data, data);
        if (found > -1)
          return found;
        let pos = this.data.length;
        for (let num of data)
          this.data.push(num);
        return pos;
      }
      finish() {
        return Uint16Array.from(this.data);
      }
    };
    function computeGotoTable(states) {
      let goto = {};
      let maxTerm = 0;
      for (let state of states) {
        for (let entry of state.goto) {
          maxTerm = Math.max(entry.term.id, maxTerm);
          let set = goto[entry.term.id] || (goto[entry.term.id] = {});
          (set[entry.target.id] || (set[entry.target.id] = [])).push(state.id);
        }
      }
      let data = new DataBuilder();
      let index = [];
      let offset = maxTerm + 2;
      for (let term = 0; term <= maxTerm; term++) {
        let entries = goto[term];
        if (!entries) {
          index.push(1);
          continue;
        }
        let termTable = [];
        let keys = Object.keys(entries);
        for (let target of keys) {
          let list = entries[target];
          termTable.push((target == keys[keys.length - 1] ? 1 : 0) + (list.length << 1));
          termTable.push(+target);
          for (let source of list)
            termTable.push(source);
        }
        index.push(data.storeArray(termTable) + offset);
      }
      if (index.some((n) => n > 65535))
        throw new GenError("Goto table too large");
      return Uint16Array.from([maxTerm + 1, ...index, ...data.data]);
    }
    var TokenGroup = class {
      constructor(tokens, groupID) {
        this.tokens = tokens;
        this.groupID = groupID;
      }
      create() {
        return this.groupID;
      }
      createSource() {
        return String(this.groupID);
      }
    };
    function addToSet(set, value) {
      if (!set.includes(value))
        set.push(value);
    }
    function buildTokenMasks(groups) {
      let masks = /* @__PURE__ */ Object.create(null);
      for (let group of groups) {
        let groupMask = 1 << group.groupID;
        for (let term of group.tokens) {
          masks[term.id] = (masks[term.id] || 0) | groupMask;
        }
      }
      return masks;
    }
    var TokenArg = class {
      constructor(name, expr, scope) {
        this.name = name;
        this.expr = expr;
        this.scope = scope;
      }
    };
    var BuildingRule = class {
      constructor(name, start, to, args) {
        this.name = name;
        this.start = start;
        this.to = to;
        this.args = args;
      }
    };
    var TokenSet = class {
      constructor(b, ast) {
        this.b = b;
        this.ast = ast;
        this.startState = new State$1();
        this.built = [];
        this.building = [];
        this.byDialect = /* @__PURE__ */ Object.create(null);
        this.precedenceRelations = [];
        this.rules = ast ? ast.rules : none;
        for (let rule of this.rules)
          b.unique(rule.id);
      }
      getToken(expr) {
        for (let built of this.built)
          if (built.matches(expr))
            return built.term;
        let name = expr.id.name;
        let rule = this.rules.find((r) => r.id.name == name);
        if (!rule)
          return null;
        let { name: nodeName, props, dialect, exported } = this.b.nodeInfo(rule.props, "d", name, expr.args, rule.params.length != expr.args.length ? none : rule.params);
        let term = this.b.makeTerminal(expr.toString(), nodeName, props);
        if (dialect != null)
          (this.byDialect[dialect] || (this.byDialect[dialect] = [])).push(term);
        if ((term.nodeType || exported) && rule.params.length == 0) {
          if (!term.nodeType)
            term.preserve = true;
          this.b.namedTerms[exported || name] = term;
        }
        this.buildRule(rule, expr, this.startState, new State$1([term]));
        this.built.push(new BuiltRule(name, expr.args, term));
        return term;
      }
      buildRule(rule, expr, from, to, args = none) {
        let name = expr.id.name;
        if (rule.params.length != expr.args.length)
          this.b.raise(`Incorrect number of arguments for token '${name}'`, expr.start);
        let building = this.building.find((b) => b.name == name && exprsEq(expr.args, b.args));
        if (building) {
          if (building.to == to) {
            from.nullEdge(building.start);
            return;
          }
          let lastIndex = this.building.length - 1;
          while (this.building[lastIndex].name != name)
            lastIndex--;
          this.b.raise(`Invalid (non-tail) recursion in token rules: ${this.building.slice(lastIndex).map((b) => b.name).join(" -> ")}`, expr.start);
        }
        this.b.used(rule.id.name);
        let start = new State$1();
        from.nullEdge(start);
        this.building.push(new BuildingRule(name, start, to, expr.args));
        this.build(this.b.substituteArgs(rule.expr, expr.args, rule.params), start, to, expr.args.map((e, i) => new TokenArg(rule.params[i].name, e, args)));
        this.building.pop();
      }
      build(expr, from, to, args) {
        if (expr instanceof NameExpression) {
          let name = expr.id.name, arg = args.find((a) => a.name == name);
          if (arg)
            return this.build(arg.expr, from, to, arg.scope);
          let rule;
          for (let i = 0, lt = this.b.localTokens; i <= lt.length; i++) {
            let set = i == lt.length ? this.b.tokens : lt[i];
            rule = set.rules.find((r) => r.id.name == name);
            if (rule)
              break;
          }
          if (!rule)
            return this.b.raise(`Reference to token rule '${name}', which isn't found`, expr.start);
          this.buildRule(rule, expr, from, to, args);
        } else if (expr instanceof CharClass) {
          for (let [a, b] of CharClasses[expr.type])
            from.edge(a, b, to);
        } else if (expr instanceof ChoiceExpression) {
          for (let choice of expr.exprs)
            this.build(choice, from, to, args);
        } else if (isEmpty(expr)) {
          from.nullEdge(to);
        } else if (expr instanceof SequenceExpression) {
          let conflict = expr.markers.find((c) => c.length > 0);
          if (conflict)
            this.b.raise("Conflict marker in token expression", conflict[0].start);
          for (let i = 0; i < expr.exprs.length; i++) {
            let next = i == expr.exprs.length - 1 ? to : new State$1();
            this.build(expr.exprs[i], from, next, args);
            from = next;
          }
        } else if (expr instanceof RepeatExpression) {
          if (expr.kind == "*") {
            let loop = new State$1();
            from.nullEdge(loop);
            this.build(expr.expr, loop, loop, args);
            loop.nullEdge(to);
          } else if (expr.kind == "+") {
            let loop = new State$1();
            this.build(expr.expr, from, loop, args);
            this.build(expr.expr, loop, loop, args);
            loop.nullEdge(to);
          } else {
            from.nullEdge(to);
            this.build(expr.expr, from, to, args);
          }
        } else if (expr instanceof SetExpression) {
          for (let [a, b] of expr.inverted ? invertRanges(expr.ranges) : expr.ranges)
            rangeEdges(from, to, a, b);
        } else if (expr instanceof LiteralExpression) {
          for (let i = 0; i < expr.value.length; i++) {
            let ch = expr.value.charCodeAt(i);
            let next = i == expr.value.length - 1 ? to : new State$1();
            from.edge(ch, ch + 1, next);
            from = next;
          }
        } else if (expr instanceof AnyExpression) {
          let mid = new State$1();
          from.edge(0, 56320, to);
          from.edge(56320, MAX_CHAR + 1, to);
          from.edge(55296, 56320, mid);
          mid.edge(56320, 57344, to);
        } else {
          return this.b.raise(`Unrecognized expression type in token`, expr.start);
        }
      }
      takePrecedences() {
        let rel = this.precedenceRelations = [];
        if (this.ast)
          for (let group of this.ast.precedences) {
            let prev = [];
            for (let item of group.items) {
              let level = [];
              if (item instanceof NameExpression) {
                for (let built of this.built)
                  if (item.args.length ? built.matches(item) : built.id == item.id.name)
                    level.push(built.term);
              } else {
                let id = JSON.stringify(item.value), found = this.built.find((b) => b.id == id);
                if (found)
                  level.push(found.term);
              }
              if (!level.length)
                this.b.warn(`Precedence specified for unknown token ${item}`, item.start);
              for (let term of level)
                addRel(rel, term, prev);
              prev = prev.concat(level);
            }
          }
      }
      precededBy(a, b) {
        let found = this.precedenceRelations.find((r) => r.term == a);
        return found && found.after.includes(b);
      }
      buildPrecTable(softConflicts) {
        let precTable = [], rel = this.precedenceRelations.slice();
        for (let { a, b, soft } of softConflicts)
          if (soft) {
            if (!rel.some((r) => r.term == a) || !rel.some((r) => r.term == b))
              continue;
            if (soft < 0)
              [a, b] = [b, a];
            addRel(rel, b, [a]);
            addRel(rel, a, []);
          }
        add: while (rel.length) {
          for (let i = 0; i < rel.length; i++) {
            let record = rel[i];
            if (record.after.every((t) => precTable.includes(t.id))) {
              precTable.push(record.term.id);
              if (rel.length == 1)
                break add;
              rel[i] = rel.pop();
              continue add;
            }
          }
          this.b.raise(`Cyclic token precedence relation between ${rel.map((r) => r.term).join(", ")}`);
        }
        return precTable;
      }
    };
    var MainTokenSet = class extends TokenSet {
      constructor() {
        super(...arguments);
        this.explicitConflicts = [];
      }
      getLiteral(expr) {
        let id = JSON.stringify(expr.value);
        for (let built of this.built)
          if (built.id == id)
            return built.term;
        let name = null, props = {}, dialect = null, exported = null;
        let decl = this.ast ? this.ast.literals.find((l) => l.literal == expr.value) : null;
        if (decl)
          ({ name, props, dialect, exported } = this.b.nodeInfo(decl.props, "da", expr.value));
        let term = this.b.makeTerminal(id, name, props);
        if (dialect != null)
          (this.byDialect[dialect] || (this.byDialect[dialect] = [])).push(term);
        if (exported)
          this.b.namedTerms[exported] = term;
        this.build(expr, this.startState, new State$1([term]), none);
        this.built.push(new BuiltRule(id, none, term));
        return term;
      }
      takeConflicts() {
        var _a;
        let resolve = (expr) => {
          if (expr instanceof NameExpression) {
            for (let built of this.built)
              if (built.matches(expr))
                return built.term;
          } else {
            let id = JSON.stringify(expr.value), found = this.built.find((b) => b.id == id);
            if (found)
              return found.term;
          }
          this.b.warn(`Conflict specified for unknown token ${expr}`, expr.start);
          return null;
        };
        for (let c of ((_a = this.ast) === null || _a === void 0 ? void 0 : _a.conflicts) || []) {
          let a = resolve(c.a), b = resolve(c.b);
          if (a && b) {
            if (a.id < b.id)
              [a, b] = [b, a];
            this.explicitConflicts.push({ a, b });
          }
        }
      }
      // Token groups are a mechanism for allowing conflicting (matching
      // overlapping input, without an explicit precedence being given)
      // tokens to exist in a grammar _if_ they don't occur in the same
      // place (aren't used in the same states).
      //
      // States that use tokens that conflict will raise an error when any
      // of the conflicting pairs of tokens both occur in that state.
      // Otherwise, they are assigned a token group, which includes all
      // the potentially-conflicting tokens they use. If there's already a
      // group that doesn't have any conflicts with those tokens, that is
      // reused, otherwise a new group is created.
      //
      // So each state has zero or one token groups, and each conflicting
      // token may belong to one or more groups. Tokens get assigned a
      // 16-bit bitmask with the groups they belong to set to 1 (all-1s
      // for non-conflicting tokens). When tokenizing, that mask is
      // compared to the current state's group (again using all-1s for
      // group-less states) to determine whether a token is applicable for
      // this state.
      //
      // Extended/specialized tokens are treated as their parent token for
      // this purpose.
      buildTokenGroups(states, skipInfo, startID) {
        let tokens = this.startState.compile();
        if (tokens.accepting.length)
          this.b.raise(`Grammar contains zero-length tokens (in '${tokens.accepting[0].name}')`, this.rules.find((r) => r.id.name == tokens.accepting[0].name).start);
        if (/\btokens\b/.test(verbose))
          console.log(tokens.toString());
        let allConflicts = tokens.findConflicts(checkTogether(states, this.b, skipInfo)).filter(({ a, b }) => !this.precededBy(a, b) && !this.precededBy(b, a));
        for (let { a, b } of this.explicitConflicts) {
          if (!allConflicts.some((c) => c.a == a && c.b == b))
            allConflicts.push(new Conflict$1(a, b, 0, "", ""));
        }
        let softConflicts = allConflicts.filter((c) => c.soft), conflicts = allConflicts.filter((c) => !c.soft);
        let errors = [];
        let groups = [];
        for (let state of states) {
          if (state.defaultReduce || state.tokenGroup > -1)
            continue;
          let terms = [], incompatible = [];
          let skip = skipInfo[this.b.skipRules.indexOf(state.skip)].startTokens;
          for (let term of skip)
            if (state.actions.some((a) => a.term == term))
              this.b.raise(`Use of token ${term.name} conflicts with skip rule`);
          let stateTerms = [];
          for (let i = 0; i < state.actions.length + (skip ? skip.length : 0); i++) {
            let term = i < state.actions.length ? state.actions[i].term : skip[i - state.actions.length];
            let orig = this.b.tokenOrigins[term.name];
            if (orig && orig.spec)
              term = orig.spec;
            else if (orig && orig.external)
              continue;
            addToSet(stateTerms, term);
          }
          if (stateTerms.length == 0)
            continue;
          for (let term of stateTerms) {
            for (let conflict of conflicts) {
              let conflicting = conflict.a == term ? conflict.b : conflict.b == term ? conflict.a : null;
              if (!conflicting)
                continue;
              if (stateTerms.includes(conflicting) && !errors.some((e) => e.conflict == conflict)) {
                let example = conflict.exampleA ? ` (example: ${JSON.stringify(conflict.exampleA)}${conflict.exampleB ? ` vs ${JSON.stringify(conflict.exampleB)}` : ""})` : "";
                errors.push({
                  error: `Overlapping tokens ${term.name} and ${conflicting.name} used in same context${example}
After: ${state.set[0].trail()}`,
                  conflict
                });
              }
              addToSet(terms, term);
              addToSet(incompatible, conflicting);
            }
          }
          let tokenGroup = null;
          for (let group of groups) {
            if (incompatible.some((term) => group.tokens.includes(term)))
              continue;
            for (let term of terms)
              addToSet(group.tokens, term);
            tokenGroup = group;
            break;
          }
          if (!tokenGroup) {
            tokenGroup = new TokenGroup(terms, groups.length + startID);
            groups.push(tokenGroup);
          }
          state.tokenGroup = tokenGroup.groupID;
        }
        if (errors.length)
          this.b.raise(errors.map((e) => e.error).join("\n\n"));
        if (groups.length + startID > 16)
          this.b.raise(`Too many different token groups (${groups.length}) to represent them as a 16-bit bitfield`);
        let precTable = this.buildPrecTable(softConflicts);
        return {
          tokenGroups: groups,
          tokenPrec: precTable,
          tokenData: tokens.toArray(buildTokenMasks(groups), precTable)
        };
      }
    };
    var LocalTokenSet = class extends TokenSet {
      constructor(b, ast) {
        super(b, ast);
        this.fallback = null;
        if (ast.fallback)
          b.unique(ast.fallback.id);
      }
      getToken(expr) {
        let term = null;
        if (this.ast.fallback && this.ast.fallback.id.name == expr.id.name) {
          if (expr.args.length)
            this.b.raise(`Incorrect number of arguments for ${expr.id.name}`, expr.start);
          if (!this.fallback) {
            let { name: nodeName, props, exported } = this.b.nodeInfo(this.ast.fallback.props, "", expr.id.name, none, none);
            let term2 = this.fallback = this.b.makeTerminal(expr.id.name, nodeName, props);
            if (term2.nodeType || exported) {
              if (!term2.nodeType)
                term2.preserve = true;
              this.b.namedTerms[exported || expr.id.name] = term2;
            }
            this.b.used(expr.id.name);
          }
          term = this.fallback;
        } else {
          term = super.getToken(expr);
        }
        if (term && !this.b.tokenOrigins[term.name])
          this.b.tokenOrigins[term.name] = { group: this };
        return term;
      }
      buildLocalGroup(states, skipInfo, id) {
        let tokens = this.startState.compile();
        if (tokens.accepting.length)
          this.b.raise(`Grammar contains zero-length tokens (in '${tokens.accepting[0].name}')`, this.rules.find((r) => r.id.name == tokens.accepting[0].name).start);
        for (let { a, b, exampleA } of tokens.findConflicts(() => true)) {
          if (!this.precededBy(a, b) && !this.precededBy(b, a))
            this.b.raise(`Overlapping tokens ${a.name} and ${b.name} in local token group${exampleA ? ` (example: ${JSON.stringify(exampleA)})` : ""}`);
        }
        for (let state of states) {
          if (state.defaultReduce)
            continue;
          let usesThis = null;
          let usesOther = skipInfo[this.b.skipRules.indexOf(state.skip)].startTokens[0];
          for (let { term } of state.actions) {
            let orig = this.b.tokenOrigins[term.name];
            while (orig === null || orig === void 0 ? void 0 : orig.spec)
              orig = this.b.tokenOrigins[orig.spec.name];
            if ((orig === null || orig === void 0 ? void 0 : orig.group) == this)
              usesThis = term;
            else
              usesOther = term;
          }
          if (usesThis) {
            if (usesOther)
              this.b.raise(`Tokens from a local token group used together with other tokens (${usesThis.name} with ${usesOther.name})`);
            state.tokenGroup = id;
          }
        }
        let precTable = this.buildPrecTable(none);
        let tokenData = tokens.toArray({
          [id]: 65535
          /* Seq.End */
        }, precTable);
        let precOffset = tokenData.length;
        let fullData = new Uint16Array(tokenData.length + precTable.length + 1);
        fullData.set(tokenData, 0);
        fullData.set(precTable, precOffset);
        fullData[fullData.length - 1] = 65535;
        return {
          groupID: id,
          create: () => new lr.LocalTokenGroup(fullData, precOffset, this.fallback ? this.fallback.id : void 0),
          createSource: (importName) => `new ${importName("LocalTokenGroup", "@lezer/lr")}(${encodeArray(fullData)}, ${precOffset}${this.fallback ? `, ${this.fallback.id}` : ""})`
        };
      }
    };
    function checkTogether(states, b, skipInfo) {
      let cache = /* @__PURE__ */ Object.create(null);
      function hasTerm(state, term) {
        return state.actions.some((a) => a.term == term) || skipInfo[b.skipRules.indexOf(state.skip)].startTokens.includes(term);
      }
      return (a, b2) => {
        if (a.id < b2.id)
          [a, b2] = [b2, a];
        let key = a.id | b2.id << 16, cached = cache[key];
        if (cached != null)
          return cached;
        return cache[key] = states.some((state) => hasTerm(state, a) && hasTerm(state, b2));
      };
    }
    function invertRanges(ranges) {
      let pos = 0, result = [];
      for (let [a, b] of ranges) {
        if (a > pos)
          result.push([pos, a]);
        pos = b;
      }
      if (pos <= MAX_CODE)
        result.push([pos, MAX_CODE + 1]);
      return result;
    }
    var ASTRAL = 65536;
    var GAP_START = 55296;
    var GAP_END = 57344;
    var MAX_CODE = 1114111;
    var LOW_SURR_B = 56320;
    var HIGH_SURR_B = 57343;
    function rangeEdges(from, to, low, hi) {
      if (low < ASTRAL) {
        if (low < GAP_START)
          from.edge(low, Math.min(hi, GAP_START), to);
        if (hi > GAP_END)
          from.edge(Math.max(low, GAP_END), Math.min(hi, MAX_CHAR + 1), to);
        low = ASTRAL;
      }
      if (hi <= ASTRAL)
        return;
      let lowStr = String.fromCodePoint(low), hiStr = String.fromCodePoint(hi - 1);
      let lowA = lowStr.charCodeAt(0), lowB = lowStr.charCodeAt(1);
      let hiA = hiStr.charCodeAt(0), hiB = hiStr.charCodeAt(1);
      if (lowA == hiA) {
        let hop = new State$1();
        from.edge(lowA, lowA + 1, hop);
        hop.edge(lowB, hiB + 1, to);
      } else {
        let midStart = lowA, midEnd = hiA;
        if (lowB > LOW_SURR_B) {
          midStart++;
          let hop = new State$1();
          from.edge(lowA, lowA + 1, hop);
          hop.edge(lowB, HIGH_SURR_B + 1, to);
        }
        if (hiB < HIGH_SURR_B) {
          midEnd--;
          let hop = new State$1();
          from.edge(hiA, hiA + 1, hop);
          hop.edge(LOW_SURR_B, hiB + 1, to);
        }
        if (midStart <= midEnd) {
          let hop = new State$1();
          from.edge(midStart, midEnd + 1, hop);
          hop.edge(LOW_SURR_B, HIGH_SURR_B + 1, to);
        }
      }
    }
    function isEmpty(expr) {
      return expr instanceof SequenceExpression && expr.exprs.length == 0;
    }
    function gatherExtTokens(b, tokens) {
      let result = /* @__PURE__ */ Object.create(null);
      for (let token of tokens) {
        b.unique(token.id);
        let { name, props, dialect } = b.nodeInfo(token.props, "d", token.id.name);
        let term = b.makeTerminal(token.id.name, name, props);
        if (dialect != null)
          (b.tokens.byDialect[dialect] || (b.tokens.byDialect[dialect] = [])).push(term);
        b.namedTerms[token.id.name] = result[token.id.name] = term;
      }
      return result;
    }
    function findExtToken(b, tokens, expr) {
      let found = tokens[expr.id.name];
      if (!found)
        return null;
      if (expr.args.length)
        b.raise("External tokens cannot take arguments", expr.args[0].start);
      b.used(expr.id.name);
      return found;
    }
    function addRel(rel, term, after) {
      let found = rel.findIndex((r) => r.term == term);
      if (found < 0)
        rel.push({ term, after });
      else
        rel[found] = { term, after: rel[found].after.concat(after) };
    }
    var ExternalTokenSet = class {
      constructor(b, ast) {
        this.b = b;
        this.ast = ast;
        this.tokens = gatherExtTokens(b, ast.tokens);
        for (let name in this.tokens)
          this.b.tokenOrigins[this.tokens[name].name] = { external: this };
      }
      getToken(expr) {
        return findExtToken(this.b, this.tokens, expr);
      }
      checkConflicts(states, skipInfo) {
        let conflicting = [];
        for (let id of this.ast.conflicts) {
          let term = this.b.namedTerms[id.name];
          if (!term) {
            this.b.warn(`Unknown conflict term '${id.name}'`);
          } else if (!term.terminal) {
            this.b.warn(`Term '${id.name}' isn't a terminal and cannot be used in a token conflict.`);
          } else if (this.tokens[id.name]) {
            this.b.warn(`External token set specifying a conflict with one of its own tokens ('${id.name}')`);
          } else {
            conflicting.push(term);
          }
        }
        if (conflicting.length)
          for (let state of states) {
            let skip = skipInfo[this.b.skipRules.indexOf(state.skip)].startTokens, relevant = false, conflict = null;
            for (let i = 0; i < state.actions.length + skip.length; i++) {
              let term = i < state.actions.length ? state.actions[i].term : skip[i - state.actions.length];
              if (term.name in this.tokens) {
                relevant = true;
              } else if (conflicting.indexOf(term) > -1) {
                conflict = term;
              }
            }
            if (relevant && conflict)
              this.b.raise(`Tokens from external group used together with conflicting token '${conflict.name}'
After: ${state.set[0].trail()}`, this.ast.start);
          }
      }
      create() {
        return this.b.options.externalTokenizer(this.ast.id.name, this.b.termTable);
      }
      createSource(importName) {
        let { source, id: { name } } = this.ast;
        return importName(name, source);
      }
    };
    var ExternalSpecializer = class {
      constructor(b, ast) {
        this.b = b;
        this.ast = ast;
        this.term = null;
        this.tokens = gatherExtTokens(b, ast.tokens);
      }
      finish() {
        let terms = this.b.normalizeExpr(this.ast.token);
        if (terms.length != 1 || terms[0].terms.length != 1 || !terms[0].terms[0].terminal)
          this.b.raise(`The token expression to '@external ${this.ast.type}' must resolve to a token`, this.ast.token.start);
        this.term = terms[0].terms[0];
        for (let name in this.tokens)
          this.b.tokenOrigins[this.tokens[name].name] = { spec: this.term, external: this };
      }
      getToken(expr) {
        return findExtToken(this.b, this.tokens, expr);
      }
    };
    function inlineRules(rules, preserve) {
      for (let pass = 0; ; pass++) {
        let inlinable = /* @__PURE__ */ Object.create(null), found;
        if (pass == 0)
          for (let rule of rules) {
            if (rule.name.inline && !inlinable[rule.name.name]) {
              let group = rules.filter((r) => r.name == rule.name);
              if (group.some((r) => r.parts.includes(rule.name)))
                continue;
              found = inlinable[rule.name.name] = group;
            }
          }
        for (let i = 0; i < rules.length; i++) {
          let rule = rules[i];
          if (!rule.name.interesting && !rule.parts.includes(rule.name) && rule.parts.length < 3 && !preserve.includes(rule.name) && (rule.parts.length == 1 || rules.every((other) => other.skip == rule.skip || !other.parts.includes(rule.name))) && !rule.parts.some((p2) => !!inlinable[p2.name]) && !rules.some((r, j) => j != i && r.name == rule.name))
            found = inlinable[rule.name.name] = [rule];
        }
        if (!found)
          return rules;
        let newRules = [];
        for (let rule of rules) {
          let expand = function(at, conflicts, parts) {
            if (at == rule.parts.length) {
              newRules.push(new Rule(rule.name, parts, conflicts, rule.skip));
              return;
            }
            let next = rule.parts[at], replace = inlinable[next.name];
            if (!replace) {
              expand(at + 1, conflicts.concat(rule.conflicts[at + 1]), parts.concat(next));
              return;
            }
            for (let r of replace)
              expand(at + 1, conflicts.slice(0, conflicts.length - 1).concat(conflicts[at].join(r.conflicts[0])).concat(r.conflicts.slice(1, r.conflicts.length - 1)).concat(rule.conflicts[at + 1].join(r.conflicts[r.conflicts.length - 1])), parts.concat(r.parts));
          };
          if (inlinable[rule.name.name])
            continue;
          if (!rule.parts.some((p2) => !!inlinable[p2.name])) {
            newRules.push(rule);
            continue;
          }
          expand(0, [rule.conflicts[0]], []);
        }
        rules = newRules;
      }
    }
    function mergeRules(rules) {
      let merged = /* @__PURE__ */ Object.create(null), found;
      for (let i = 0; i < rules.length; ) {
        let groupStart = i;
        let name = rules[i++].name;
        while (i < rules.length && rules[i].name == name)
          i++;
        let size = i - groupStart;
        if (name.interesting)
          continue;
        for (let j = i; j < rules.length; ) {
          let otherStart = j, otherName = rules[j++].name;
          while (j < rules.length && rules[j].name == otherName)
            j++;
          if (j - otherStart != size || otherName.interesting)
            continue;
          let match = true;
          for (let k = 0; k < size && match; k++) {
            let a = rules[groupStart + k], b = rules[otherStart + k];
            if (a.cmpNoName(b) != 0)
              match = false;
          }
          if (match)
            found = merged[name.name] = otherName;
        }
      }
      if (!found)
        return rules;
      let newRules = [];
      for (let rule of rules)
        if (!merged[rule.name.name]) {
          newRules.push(rule.parts.every((p2) => !merged[p2.name]) ? rule : new Rule(rule.name, rule.parts.map((p2) => merged[p2.name] || p2), rule.conflicts, rule.skip));
        }
      return newRules;
    }
    function simplifyRules(rules, preserve) {
      return mergeRules(inlineRules(rules, preserve));
    }
    function buildParser2(text, options = {}) {
      let builder = new Builder(text, options), parser2 = builder.getParser();
      parser2.termTable = builder.termTable;
      return parser2;
    }
    var KEYWORDS = [
      "arguments",
      "await",
      "break",
      "case",
      "catch",
      "continue",
      "debugger",
      "default",
      "do",
      "else",
      "eval",
      "finally",
      "for",
      "function",
      "if",
      "return",
      "switch",
      "throw",
      "try",
      "var",
      "while",
      "with",
      "null",
      "true",
      "false",
      "instanceof",
      "typeof",
      "void",
      "delete",
      "new",
      "in",
      "this",
      "const",
      "class",
      "extends",
      "export",
      "import",
      "super",
      "enum",
      "implements",
      "interface",
      "let",
      "package",
      "private",
      "protected",
      "public",
      "static",
      "yield",
      "require"
    ];
    function buildParserFile(text, options = {}) {
      return new Builder(text, options).getParserFile();
    }
    function ignored(name) {
      let first = name[0];
      return first == "_" || first.toUpperCase() != first;
    }
    function isExported(rule) {
      return rule.props.some((p2) => p2.at && p2.name == "export");
    }
    exports2.GenError = GenError;
    exports2.buildParser = buildParser2;
    exports2.buildParserFile = buildParserFile;
  }
});

// namemap.json
var require_namemap = __commonJS({
  "namemap.json"(exports2, module2) {
    module2.exports = { Prelude: "prelude", Use_stmt: "use-stmt", Import_stmt: "import-stmt", Import_source: "import-source", Import_special: "import-special", Import_name: "import-name", Include_spec: "include-spec", Include_name_spec: "include-name-spec", Include_type_spec: "include-type-spec", Include_data_spec: "include-data-spec", Include_module_spec: "include-module-spec", Provide_stmt: "provide-stmt", Provide_vals_stmt: "provide-vals-stmt", Provide_types_stmt: "provide-types-stmt", Provide_block: "provide-block", Provide_spec: "provide-spec", Name_spec: "name-spec", Data_name_spec: "data-name-spec", Provide_name_spec: "provide-name-spec", Provide_type_spec: "provide-type-spec", Provide_data_spec: "provide-data-spec", Provide_module_spec: "provide-module-spec", Hiding_spec: "hiding-spec", Module_ref: "module-ref", Comma_names: "comma-names", Block: "block", Stmt: "stmt", Spy_stmt: "spy-stmt", Spy_contents: "spy-contents", Spy_field: "spy-field", Type_expr: "type-expr", Newtype_expr: "newtype-expr", Let_expr: "let-expr", Binding: "binding", Tuple_binding: "tuple-binding", Name_binding: "name-binding", Toplevel_binding: "toplevel-binding", Multi_let_expr: "multi-let-expr", Let_binding: "let-binding", Letrec_expr: "letrec-expr", Type_bind: "type-bind", Newtype_bind: "newtype-bind", Type_let_bind: "type-let-bind", Type_let_expr: "type-let-expr", Contract_stmt: "contract-stmt", Fun_expr: "fun-expr", Fun_header: "fun-header", Ty_params: "ty-params", Args: "args", Bad_args: "bad-args", Return_ann: "return-ann", Doc_string: "doc-string", Where_clause: "where-clause", Check_expr: "check-expr", Check_test: "check-test", Data_expr: "data-expr", Variant_constructor: "variant-constructor", First_data_variant: "first-data-variant", Data_variant: "data-variant", Variant_members: "variant-members", Variant_member: "variant-member", Data_with: "data-with", Data_sharing: "data-sharing", Var_expr: "var-expr", Rec_expr: "rec-expr", Assign_expr: "assign-expr", When_expr: "when-expr", Binop_expr: "binop-expr", Binop: "binop", Check_op: "check-op", Check_op_postfix: "check-op-postfix", Expr: "expr", Template_expr: "template-expr", Paren_expr: "paren-expr", Id_expr: "id-expr", Prim_expr: "prim-expr", Num_expr: "num-expr", Frac_expr: "frac-expr", Rfrac_expr: "rfrac-expr", Bool_expr: "bool-expr", String_expr: "string-expr", Lambda_expr: "lambda-expr", Method_expr: "method-expr", App_expr: "app-expr", App_args: "app-args", Opt_comma_binops: "opt-comma-binops", Comma_binops: "comma-binops", Trailing_opt_comma_binops: "trailing-opt-comma-binops", Inst_expr: "inst-expr", Tuple_expr: "tuple-expr", Tuple_fields: "tuple-fields", Tuple_get: "tuple-get", Obj_expr: "obj-expr", Obj_fields: "obj-fields", Obj_field: "obj-field", Fields: "fields", Field: "field", Key: "key", Construct_expr: "construct-expr", Construct_modifier: "construct-modifier", Table_expr: "table-expr", Table_headers: "table-headers", List_table_header: "list-table-header", Table_header: "table-header", Table_rows: "table-rows", Table_row: "table-row", Table_items: "table-items", List_table_item: "list-table-item", Reactor_expr: "reactor-expr", Dot_expr: "dot-expr", Bracket_expr: "bracket-expr", Get_bang_expr: "get-bang-expr", Extend_expr: "extend-expr", Update_expr: "update-expr", If_expr: "if-expr", Else_if: "else-if", If_pipe_expr: "if-pipe-expr", If_pipe_branch: "if-pipe-branch", Cases_binding: "cases-binding", Cases_args: "cases-args", Cases_expr: "cases-expr", Cases_branch: "cases-branch", For_bind: "for-bind", For_expr: "for-expr", Column_order: "column-order", Table_select: "table-select", Table_filter: "table-filter", Table_order: "table-order", Table_extract: "table-extract", Table_update: "table-update", Table_extend: "table-extend", Table_extend_fields: "table-extend-fields", List_table_extend_field: "list-table-extend-field", Table_extend_field: "table-extend-field", Load_table_expr: "load-table-expr", Load_table_specs: "load-table-specs", Load_table_spec: "load-table-spec", User_block_expr: "user-block-expr", Ann: "ann", Name_ann: "name-ann", Comma_ann_field: "comma-ann-field", Trailing_opt_comma_ann_field: "trailing-opt-comma-ann-field", Record_ann: "record-ann", Ann_field: "ann-field", Tuple_ann: "tuple-ann", Noparen_arrow_ann: "noparen-arrow-ann", Arrow_ann_args: "arrow-ann-args", Arrow_ann: "arrow-ann", App_ann: "app-ann", Comma_anns: "comma-anns", Pred_ann: "pred-ann", Dot_ann: "dot-ann" };
  }
});

// to-rnglr.js
var require_to_rnglr = __commonJS({
  "to-rnglr.js"(exports2, module2) {
    var namemap = require_namemap();
    function mapName(n) {
      if (n === "Program") return "program";
      return namemap[n] || n.replace(/_/g, "-");
    }
    var isNonterminal = (n) => n === "Program" || Object.prototype.hasOwnProperty.call(namemap, n);
    function lineStarts(src) {
      const starts = [0];
      for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
      return starts;
    }
    function rowColAt(starts, off) {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = lo + hi + 1 >> 1;
        if (starts[mid] <= off) lo = mid;
        else hi = mid - 1;
      }
      return { row: lo + 1, col: off - starts[lo] };
    }
    function mkPos(starts, from, to) {
      const a = rowColAt(starts, from), b = rowColAt(starts, to);
      const p = {
        startRow: a.row,
        startCol: a.col,
        startChar: from,
        endRow: b.row,
        endCol: b.col,
        endChar: to
      };
      p.posAtStart = () => mkPos(starts, from, from);
      p.posAtEnd = () => mkPos(starts, to, to);
      p.combine = function(that) {
        if (this.startChar < that.startChar) {
          return this.endChar < that.endChar ? mkPos(starts, this.startChar, that.endChar) : mkPos(starts, this.startChar, this.endChar);
        } else {
          return this.endChar < that.endChar ? mkPos(starts, that.startChar, that.endChar) : mkPos(starts, that.startChar, this.endChar);
        }
      };
      return p;
    }
    var WRAP = {
      "trailing-opt-comma-binops": "comma-binops",
      "trailing-opt-comma-ann-field": "comma-ann-field"
    };
    function firstTerminalFrom(n) {
      if (!isNonterminal(n.name) && n.name !== "Space") return n.from;
      for (const c of n.children || []) {
        const r = firstTerminalFrom(c);
        if (r != null) return r;
      }
      return null;
    }
    function toRnglr2(lezNode, src) {
      const starts = lineStarts(src);
      const len = src.length;
      const emptyPos = (off) => off >= len ? mkPos(starts, len + 1, len + 1) : mkPos(starts, off, off);
      let lastEnd = firstTerminalFrom(lezNode);
      if (lastEnd == null) lastEnd = len;
      function conv(n) {
        if (n.name === "Space") return null;
        const name = mapName(n.name);
        if (!isNonterminal(n.name)) {
          const pos = mkPos(starts, n.from, n.to);
          lastEnd = n.to;
          const value = n.value !== void 0 ? n.value : src.slice(n.from, n.to);
          return { name, value, pos, kids: [] };
        }
        if (!n.children || n.children.length === 0) {
          return { name, kids: [], pos: emptyPos(lastEnd) };
        }
        let kids = [];
        for (const c of n.children) {
          const k = conv(c);
          if (k) kids.push(k);
        }
        if (kids.length === 0) {
          return { name, kids: [], pos: emptyPos(lastEnd) };
        }
        const wrapName = WRAP[name];
        if (wrapName) {
          let trailingComma = null;
          if (kids[kids.length - 1].name === "COMMA") trailingComma = kids.pop();
          const wrapped = { name: wrapName, kids, pos: spanPos(starts, kids) };
          kids = trailingComma ? [wrapped, trailingComma] : [wrapped];
        }
        return { name, kids, pos: spanPos(starts, kids) };
      }
      return conv(lezNode);
    }
    function spanPos(starts, kids) {
      return mkPos(starts, kids[0].pos.startChar, kids[kids.length - 1].pos.endChar);
    }
    module2.exports = { toRnglr: toRnglr2, mapName };
  }
});

// pyret.named.grammar
var require_pyret_named = __commonJS({
  "pyret.named.grammar"(exports2, module2) {
    module2.exports = "// GENERATED by gen-grammar.js from pyret-grammar.bnf \u2014 do not edit by hand\n@top Program { Prelude Block }\n\n// CONFLICT: postfix forms (app/dot/bracket/bang/inst) bind tighter than binops,\n// and chain left-to-right. The `!postfix` marked shifts beat the (unmarked) Binop\n// loop-iteration reduce, so postfix wins over continuing/ending the Binop chain.\n@precedence {\n  seqP @left,\n  postfix @left,\n  inst @left\n}\n\nPrelude { (Use_stmt)? (Provide_stmt | Import_stmt)* }\nUse_stmt { USE NAME Import_source }\nImport_stmt { INCLUDE Import_source | INCLUDE FROM Module_ref COLON (Include_spec (COMMA Include_spec)* (COMMA)?)? END | IMPORT Import_source AS NAME | IMPORT Comma_names FROM Import_source }\nImport_source { Import_special | Import_name }\nImport_special { NAME PARENNOSPACE STRING (COMMA STRING)* RPAREN }\nImport_name { NAME }\nInclude_spec { Include_name_spec | Include_type_spec | Include_data_spec | Include_module_spec }\nInclude_name_spec { Name_spec }\nInclude_type_spec { TYPE Name_spec }\nInclude_data_spec { DATA Data_name_spec (Hiding_spec)? }\nInclude_module_spec { MODULE Name_spec }\nProvide_stmt { Provide_vals_stmt | Provide_types_stmt | Provide_block }\nProvide_vals_stmt { PROVIDE Stmt END | PROVIDE (STAR | TIMES) }\nProvide_types_stmt { PROVIDE_TYPES Record_ann | PROVIDE_TYPES (STAR | TIMES) }\nProvide_block { PROVIDECOLON (Provide_spec (COMMA Provide_spec)* (COMMA)?)? END | PROVIDE FROM Module_ref COLON (Provide_spec (COMMA Provide_spec)* (COMMA)?)? END }\nProvide_spec { Provide_name_spec | Provide_type_spec | Provide_data_spec | Provide_module_spec }\nName_spec { (STAR | TIMES) (Hiding_spec)? | Module_ref | Module_ref AS NAME }\nData_name_spec { (STAR | TIMES) | Module_ref }\nProvide_name_spec { Name_spec }\nProvide_type_spec { TYPE Name_spec }\nProvide_data_spec { DATA Data_name_spec (Hiding_spec)? }\nProvide_module_spec { MODULE Name_spec }\nHiding_spec { HIDING (PARENSPACE | PARENNOSPACE) ((NAME COMMA)* NAME)? RPAREN }\nModule_ref { (NAME DOT)* NAME }\nComma_names { NAME (COMMA NAME)* }\nBlock { Stmt* }\nStmt { Type_expr | Newtype_expr | Spy_stmt | Let_expr | Fun_expr | Data_expr | When_expr | Var_expr | Rec_expr | Assign_expr | Check_test | Check_expr | Contract_stmt }\nSpy_stmt { SPY (Binop_expr)? COLON (Spy_contents)? END }\nSpy_contents { Spy_field (COMMA Spy_field)* }\nSpy_field { Id_expr | NAME COLON Binop_expr }\nType_expr { TYPE NAME Ty_params EQUALS Ann }\nNewtype_expr { NEWTYPE NAME AS NAME }\nLet_expr { Toplevel_binding EQUALS Binop_expr }\nBinding { Name_binding | Tuple_binding }\nTuple_binding { LBRACE (Binding SEMI)* Binding (SEMI)? RBRACE (AS Name_binding)? }\nName_binding { (SHADOW)? NAME ~idamb (COLONCOLON ~ctr Ann)? }\nToplevel_binding { Binding }\nMulti_let_expr { LET Let_binding (COMMA Let_binding)* (BLOCK | COLON) Block END }\nLet_binding { Let_expr | Var_expr }\nLetrec_expr { LETREC Let_expr (COMMA Let_expr)* (BLOCK | COLON) Block END }\nType_bind { NAME Ty_params EQUALS Ann }\nNewtype_bind { NEWTYPE NAME AS NAME }\nType_let_bind { Type_bind | Newtype_bind }\nType_let_expr { TYPE_LET Type_let_bind (COMMA Type_let_bind)* (BLOCK | COLON) Block END }\nContract_stmt { NAME COLONCOLON ~ctr Ty_params (Ann | Noparen_arrow_ann) }\nFun_expr { FUN NAME Fun_header (BLOCK | COLON) Doc_string Block Where_clause END }\nFun_header { Ty_params Args Return_ann | Ty_params Bad_args Return_ann }\nTy_params { ((LANGLE | LT) Comma_names (RANGLE | GT))? }\nArgs { (PARENNOSPACE | PARENAFTERBRACE) (Binding (COMMA Binding)*)? RPAREN }\nBad_args { PARENSPACE (Binding (COMMA Binding)*)? RPAREN }\nReturn_ann { (THINARROW Ann)? }\nDoc_string { (DOC STRING)? }\nWhere_clause { (WHERE Block)? }\nCheck_expr { (CHECK | EXAMPLES) STRING COLON Block END | (CHECKCOLON | EXAMPLESCOLON) Block END }\nCheck_test { Binop_expr Check_op (PERCENT (PARENSPACE | PARENNOSPACE) Binop_expr RPAREN)? Binop_expr (BECAUSE Binop_expr)? | Binop_expr Check_op_postfix (BECAUSE Binop_expr)? | Binop_expr }\nData_expr { DATA NAME Ty_params COLON (First_data_variant)? Data_variant* Data_sharing Where_clause END }\nVariant_constructor { NAME Variant_members }\nFirst_data_variant { Variant_constructor Data_with | NAME Data_with }\nData_variant { BAR Variant_constructor Data_with | BAR NAME Data_with }\nVariant_members { PARENNOSPACE (Variant_member (COMMA Variant_member)*)? RPAREN }\nVariant_member { (REF)? Binding }\nData_with { (WITH Fields)? }\nData_sharing { (SHARING Fields)? }\nVar_expr { VAR Toplevel_binding EQUALS Binop_expr }\nRec_expr { REC Toplevel_binding EQUALS Binop_expr }\nAssign_expr { NAME COLONEQUALS Binop_expr }\nWhen_expr { WHEN Binop_expr (BLOCK | COLON) Block END }\n// CONFLICT: ~spaceapp keeps both arms when an `Expr` is followed by a token that\n// could either EXTEND it (space-paren app `Expr PARENSPACE ...`, or index\n// `Expr LBRACK ...`) or START A NEW STATEMENT (Paren_expr `(x)` / Construct_expr\n// `[list: ...]`). Pyret has no single-arg space-app and no bare `[..]` literal, so\n// exactly one arm survives the token after the inner Binop (COMMA/COLON vs RPAREN/\n// RBRACK) -> matches RNGLR's unique parse, zero over-acceptance. Paired markers are\n// on Binop_expr (the reduce/boundary), App_expr PARENSPACE forms, and Bracket_expr.\n// NOTE: the ~spaceapp is repeated AFTER EACH loop operand (not just the first) so a\n// bracket-index as a RIGHT Binop operand (`1 + o[0]`) stays ambiguous with the\n// statement-split instead of being force-reduced; and the loop carries NO precedence\n// marker, so the bracket shift is not overridden by a Binop reduce.\nBinop_expr { Expr ~spaceapp (Binop Expr ~spaceapp)* }\nBinop { PLUS | DASH | TIMES | SLASH | LEQ | GEQ | EQUALEQUAL | SPACESHIP | EQUALTILDE | NEQ | LT | GT | AND | OR | CARET }\nCheck_op { IS | ISEQUALEQUAL | ISEQUALTILDE | ISSPACESHIP | ISROUGHLY | ISNOTROUGHLY | ISNOT | ISNOTEQUALEQUAL | ISNOTEQUALTILDE | ISNOTSPACESHIP | RAISES | RAISESOTHER | SATISFIES | SATISFIESNOT | RAISESSATISFIES | RAISESVIOLATES }\nCheck_op_postfix { RAISESNOT }\nExpr { Paren_expr | Id_expr | Prim_expr | Lambda_expr | Method_expr | App_expr | Obj_expr | Tuple_expr | Tuple_get | Dot_expr | Template_expr | Bracket_expr | Get_bang_expr | Update_expr | Extend_expr | If_expr | If_pipe_expr | Cases_expr | For_expr | User_block_expr | Inst_expr | Multi_let_expr | Letrec_expr | Type_let_expr | Construct_expr | Table_select | Table_extend | Table_filter | Table_order | Table_extract | Table_update | Table_expr | Load_table_expr | Reactor_expr }\nTemplate_expr { DOTDOTDOT }\nParen_expr { PARENSPACE Binop_expr RPAREN | PARENAFTERBRACE Binop_expr RPAREN }\nId_expr { NAME ~idamb }\nPrim_expr { Num_expr | Frac_expr | Rfrac_expr | Bool_expr | String_expr }\nNum_expr { NUMBER }\nFrac_expr { RATIONAL }\nRfrac_expr { ROUGHRATIONAL }\nBool_expr { TRUE | FALSE }\nString_expr { STRING }\n// CONFLICT: `{(...` is LR-limited between curly-lambda and tuple/obj-with-paren-Expr;\n// exactly one survives later tokens, so ~lbrace keeps both (matches RNGLR's unique parse).\nLambda_expr { LAM Fun_header (BLOCK | COLON) Doc_string Block Where_clause END | LBRACE ~lbrace Fun_header (BLOCK | COLON) Doc_string Block Where_clause RBRACE }\nMethod_expr { METHOD Fun_header (BLOCK | COLON) Doc_string Block Where_clause END }\nApp_expr { Expr !postfix App_args | Expr ~spaceapp PARENSPACE RPAREN | Expr ~spaceapp PARENSPACE Binop_expr COMMA Binop_expr (COMMA Binop_expr)* RPAREN }\nApp_args { PARENNOSPACE Opt_comma_binops RPAREN }\nOpt_comma_binops { (Comma_binops)? }\nComma_binops { Binop_expr (COMMA Binop_expr)* }\nTrailing_opt_comma_binops { (Binop_expr (COMMA Binop_expr)* (COMMA)?)? }\nInst_expr { Expr !inst LANGLE Ann (COMMA Ann)* (RANGLE | GT) }\nTuple_expr { LBRACE ~lbrace Tuple_fields RBRACE }\nTuple_fields { Binop_expr (SEMI Binop_expr)* (SEMI)? }\nTuple_get { Expr !postfix DOT LBRACE NUMBER RBRACE }\nObj_expr { LBRACE ~lbrace Obj_fields RBRACE | LBRACE RBRACE }\nObj_fields { Obj_field (COMMA Obj_field)* (COMMA)? }\nObj_field { Key COLON Binop_expr | REF Key (COLONCOLON Ann)? COLON Binop_expr | METHOD Key Fun_header (BLOCK | COLON) Doc_string Block Where_clause END }\nFields { Field (COMMA Field)* (COMMA)? }\nField { Key COLON Binop_expr | METHOD Key Fun_header (BLOCK | COLON) Doc_string Block Where_clause END }\nKey { NAME }\nConstruct_expr { LBRACK Construct_modifier Binop_expr COLON Trailing_opt_comma_binops RBRACK }\nConstruct_modifier { (LAZY)? }\nTable_expr { TABLE Table_headers Table_rows END }\nTable_headers { (List_table_header* Table_header)? }\nList_table_header { Table_header COMMA }\nTable_header { NAME (COLONCOLON Ann)? }\nTable_rows { (Table_row* Table_row)? }\nTable_row { ROW Table_items }\nTable_items { (List_table_item* Binop_expr)? }\nList_table_item { Binop_expr COMMA }\nReactor_expr { REACTOR COLON Fields END }\nDot_expr { Expr !postfix DOT NAME }\nBracket_expr { Expr ~spaceapp LBRACK Binop_expr RBRACK }\nGet_bang_expr { Expr !postfix BANG NAME }\nExtend_expr { Expr !postfix DOT LBRACE Fields RBRACE }\nUpdate_expr { Expr !postfix BANG LBRACE Fields RBRACE }\nIf_expr { IF Binop_expr (BLOCK | COLON) Block Else_if* (ELSECOLON Block)? END }\nElse_if { ELSEIF Binop_expr COLON Block }\nIf_pipe_expr { ASK (BLOCK | COLON) If_pipe_branch* (BAR OTHERWISECOLON Block)? END }\nIf_pipe_branch { BAR Binop_expr THENCOLON Block }\nCases_binding { (REF)? Binding }\nCases_args { PARENNOSPACE (Cases_binding (COMMA Cases_binding)*)? RPAREN }\nCases_expr { CASES (PARENSPACE | PARENNOSPACE) Ann RPAREN Binop_expr (BLOCK | COLON) Cases_branch* (BAR ELSE THICKARROW Block)? END }\nCases_branch { BAR NAME (Cases_args)? THICKARROW Block }\nFor_bind { Binding FROM Binop_expr }\nFor_expr { FOR Expr PARENNOSPACE (For_bind (COMMA For_bind)*)? !seqP RPAREN Return_ann (BLOCK | COLON) Block END }\nColumn_order { NAME (ASCENDING | DESCENDING) }\nTable_select { TABLE_SELECT NAME (COMMA NAME)* FROM Expr END }\nTable_filter { TABLE_FILTER Expr (USING Binding (COMMA Binding)*)? COLON Binop_expr END }\nTable_order { TABLE_ORDER Expr COLON Column_order (COMMA Column_order)* END }\nTable_extract { TABLE_EXTRACT NAME FROM Expr END }\nTable_update { TABLE_UPDATE Expr (USING Binding (COMMA Binding)*)? COLON Obj_fields END }\nTable_extend { TABLE_EXTEND Expr (USING Binding (COMMA Binding)*)? COLON Table_extend_fields END }\nTable_extend_fields { List_table_extend_field* Table_extend_field (COMMA)? }\nList_table_extend_field { Table_extend_field COMMA }\nTable_extend_field { Key (COLONCOLON Ann)? COLON Binop_expr | Key (COLONCOLON Ann)? COLON Expr OF NAME }\nLoad_table_expr { LOAD_TABLE COLON Table_headers (Load_table_specs)? END }\nLoad_table_specs { Load_table_spec* Load_table_spec }\nLoad_table_spec { SOURCECOLON Expr | SANITIZE NAME USING Expr }\nUser_block_expr { BLOCK Block END }\nAnn { Name_ann | Record_ann | Arrow_ann | App_ann | Pred_ann | Dot_ann | Tuple_ann }\nName_ann { NAME }\nComma_ann_field { Ann_field (COMMA Ann_field)* }\n// CONFLICT: inline list+trailing-comma into one rule so Lezer auto-resolves the\n// separator-vs-trailing COMMA via 1-token lookahead (behavior-preserving).\nTrailing_opt_comma_ann_field { (Ann_field (COMMA Ann_field)* (COMMA)?)? }\nRecord_ann { LBRACE Trailing_opt_comma_ann_field RBRACE }\nAnn_field { NAME COLONCOLON Ann }\nTuple_ann { LBRACE Ann (SEMI Ann)* (SEMI)? RBRACE }\nNoparen_arrow_ann { (Arrow_ann_args)? THINARROW Ann }\nArrow_ann_args { Comma_anns | (PARENSPACE | PARENNOSPACE | PARENAFTERBRACE) Comma_ann_field RPAREN }\nArrow_ann { (PARENSPACE | PARENNOSPACE | PARENAFTERBRACE) (Arrow_ann_args)? THINARROW Ann RPAREN }\nApp_ann { (Name_ann | Dot_ann) LANGLE Comma_anns (RANGLE | GT) }\nComma_anns { Ann (COMMA Ann)* }\nPred_ann { Ann PERCENT (PARENSPACE | PARENNOSPACE) Id_expr RPAREN }\nDot_ann { NAME DOT NAME }\n\n@skip { Space }\n\n@external tokens pyretTokens from \"./tokens\" {\n  AND,\n  AS,\n  ASCENDING,\n  ASK,\n  BANG,\n  BAR,\n  BECAUSE,\n  BLOCK,\n  CARET,\n  CASES,\n  CHECK,\n  CHECKCOLON,\n  COLON,\n  COLONCOLON,\n  COLONEQUALS,\n  COMMA,\n  DASH,\n  DATA,\n  DESCENDING,\n  DOC,\n  DOT,\n  DOTDOTDOT,\n  ELSE,\n  ELSECOLON,\n  ELSEIF,\n  END,\n  EQUALEQUAL,\n  EQUALS,\n  EQUALTILDE,\n  EXAMPLES,\n  EXAMPLESCOLON,\n  FALSE,\n  FOR,\n  FROM,\n  FUN,\n  GEQ,\n  GT,\n  HIDING,\n  IF,\n  IMPORT,\n  INCLUDE,\n  IS,\n  ISEQUALEQUAL,\n  ISEQUALTILDE,\n  ISNOT,\n  ISNOTEQUALEQUAL,\n  ISNOTEQUALTILDE,\n  ISNOTROUGHLY,\n  ISNOTSPACESHIP,\n  ISROUGHLY,\n  ISSPACESHIP,\n  LAM,\n  LANGLE,\n  LAZY,\n  LBRACE,\n  LBRACK,\n  LEQ,\n  LET,\n  LETREC,\n  LOAD_TABLE,\n  LT,\n  METHOD,\n  MODULE,\n  NAME,\n  NEQ,\n  NEWTYPE,\n  NUMBER,\n  OF,\n  OR,\n  OTHERWISECOLON,\n  PARENAFTERBRACE,\n  PARENNOSPACE,\n  PARENSPACE,\n  PERCENT,\n  PLUS,\n  PROVIDE,\n  PROVIDECOLON,\n  PROVIDE_TYPES,\n  RAISES,\n  RAISESNOT,\n  RAISESOTHER,\n  RAISESSATISFIES,\n  RAISESVIOLATES,\n  RANGLE,\n  RATIONAL,\n  RBRACE,\n  RBRACK,\n  REACTOR,\n  REC,\n  REF,\n  ROUGHRATIONAL,\n  ROW,\n  RPAREN,\n  SANITIZE,\n  SATISFIES,\n  SATISFIESNOT,\n  SEMI,\n  SHADOW,\n  SHARING,\n  SLASH,\n  SOURCECOLON,\n  SPACESHIP,\n  SPY,\n  STAR,\n  STRING,\n  TABLE,\n  TABLE_EXTEND,\n  TABLE_EXTRACT,\n  TABLE_FILTER,\n  TABLE_ORDER,\n  TABLE_SELECT,\n  TABLE_UPDATE,\n  THENCOLON,\n  THICKARROW,\n  THINARROW,\n  TIMES,\n  TRUE,\n  TYPE,\n  TYPE_LET,\n  USE,\n  USING,\n  VAR,\n  WHEN,\n  WHERE,\n  WITH,\n  Space\n}\n";
  }
});

// bundle-entry.js
var { buildParser } = require_dist3();
var { ExternalTokenizer } = require_dist2();
var { toRnglr } = require_to_rnglr();
var grammarText = require_pyret_named();
var san = (n) => n.replace(/-/g, "_");
var parser = null;
var TERMS = null;
var CUR = /* @__PURE__ */ new Map();
function build() {
  if (parser) return parser;
  parser = buildParser(grammarText, {
    externalTokenizer: (name, terms) => {
      TERMS = terms;
      return new ExternalTokenizer((input) => {
        const t = CUR.get(input.pos);
        if (!t || t.term == null) return;
        input.acceptTokenTo(t.term, t.e);
      });
    }
  });
  return parser;
}
function tileTokens(tokens, len) {
  const map = /* @__PURE__ */ new Map();
  let prev = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.name === "EOF") break;
    const s = t.startChar, e = t.endChar;
    if (s > prev) map.set(prev, { e: s, term: TERMS.Space });
    const term = TERMS[san(t.name)];
    map.set(s, { e, term: term === void 0 ? null : term, value: t.value });
    prev = e;
  }
  if (prev < len) map.set(prev, { e: len, term: TERMS.Space });
  return map;
}
function buildNested(tree) {
  const c = tree.cursor();
  function rec() {
    const node = { name: c.name, from: c.from, to: c.to, children: [] };
    if (c.firstChild()) {
      do {
        node.children.push(rec());
      } while (c.nextSibling());
      c.parent();
    } else {
      const ti = CUR.get(node.from);
      if (ti && ti.e === node.to && ti.value !== void 0) node.value = ti.value;
    }
    return node;
  }
  return rec();
}
function firstError(tree) {
  const c = tree.cursor();
  do {
    if (c.type.isError) return { from: c.from, to: c.to };
  } while (c.next());
  return null;
}
function lezerParseToRnglr(pyretTokens, src) {
  if (process.env.LEZER_TRACE) process.stderr.write("[LEZER-FRONTEND] parsing " + src.length + " chars\n");
  build();
  CUR = tileTokens(pyretTokens, src.length);
  const tree = parser.parse(src);
  const err = firstError(tree);
  if (err) {
    const e = new Error("LEZER_PARSE_ERROR");
    e.lezerParseError = err;
    throw e;
  }
  return toRnglr(buildNested(tree), src);
}
module.exports = { lezerParseToRnglr };
