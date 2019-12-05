import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";
import { UnControlled as CodeMirror } from 'react-codemirror2';
import * as control from './control';
import { Editor } from 'codemirror';


type DefChunkProps = {
  name: string,
  failures: string[],
  highlights: number[][],
  index: number,
  startLine: number,
  chunk: string,
  onEdit: (key: number, chunk: string) => void,
  appendNewChunk: () => void,
  isLast: boolean,
  focused: boolean,
  takeFocus: () => void,
};
type DefChunkState = {
  editor: CodeMirror.Editor | null,
  updateTimer: NodeJS.Timeout
};

export class DefChunk extends React.Component<DefChunkProps, DefChunkState> {
  lineFormatter: (l : number) => string;
  thys: () => DefChunk;

  constructor(props : DefChunkProps) {
    super(props);
    const onFirstUpdate = () => { this.lint(this.props.chunk); }
    this.state = { editor: null, updateTimer: setTimeout(onFirstUpdate, 0) };
    this.lineFormatter = (l : number) => { return String(l + this.props.startLine); };
    this.thys = () => { return this; };
  }

  componentDidUpdate(prevProps : DefChunkProps) {
    if(this.state.editor !== null) {
      if(prevProps.startLine !== this.props.startLine) {
        console.log(this.props, prevProps, this.lineFormatter(1));
        this.state.editor.refresh();
      }
      if(this.props.focused) {
        this.state.editor.focus();
      }
      const marks = this.state.editor.getDoc().getAllMarks();
      marks.forEach(m => m.clear());
      if (this.props.highlights.length > 0) {
          for (let i = 0; i < this.props.highlights.length; i++) {
              this.state.editor.getDoc().markText(
                  { line: this.props.highlights[i][0] - 1 - this.props.startLine,
                      ch: this.props.highlights[i][1] },
                  { line: this.props.highlights[i][2] - 1 - this.props.startLine,
                      ch: this.props.highlights[i][3] },
                  { className: "styled-background-error" });
          }
      }
    }
  }
  scheduleUpdate(value : string) {
    clearTimeout(this.state.updateTimer);
    this.setState({
        updateTimer: setTimeout(() => {
          this.props.onEdit(this.props.index, value);
          this.lint(value);
        }, 250)
      });
  }
  lint(value : string) {
    control.lint(value, this.props.name);
  }
  onBeforeChange() {}
  onFocus(_ : any, __ : any) {
    this.props.takeFocus();
  }
  editorDidMount = (editor : Editor, value : string) => {
    this.setState({editor: editor});
    const marks = editor.getDoc().getAllMarks();
    marks.forEach(m => m.clear());
    editor.setSize(null, "auto");
  }
  onChange(editor : Editor, __ : any, value : string) {
    this.scheduleUpdate(value);
  }

  render() {
    let borderWidth = "2px";
    let borderColor = "#eee";
    let shadow = "";
    if(this.props.focused) { shadow = "3px 3px 2px #aaa"; borderWidth = "2px"; borderColor = "black"; }
    if(this.props.highlights.length > 0) { borderColor = "red"; }
    const border = borderWidth + " solid " + borderColor;
    return (<div style={{ boxShadow: shadow, border: border, "paddingTop": "0.5em", "paddingBottom": "0.5em" }}>
      <CodeMirror
        onChange={this.onChange.bind(this)}
        onFocus={this.onFocus.bind(this)}
        onMouseDown={this.props.isLast ? () => this.props.appendNewChunk() : () => {}}
        editorDidMount={this.editorDidMount}
        value={this.props.chunk}

        options={{
          mode: 'pyret',
          theme: 'default',
          lineNumbers: false,
          lineWrapping: true,
          lineNumberFormatter: this.lineFormatter,
          readOnly: this.props.isLast ? 'nocursor' : false
        }}

        autoCursor={false}>
      </CodeMirror>
      <ul>
        {this.props.failures.map((f, ix) => <li key={String(ix)}>{f}</li>)}
      </ul>
      </div>);
  }
}

type Chunk = {
  startLine: number,
  id: string,
  text: string
}

type LintFailure = {
    name: string,
    errors: string[]
}

type DefChunksProps = {
  lintFailures: {[name : string]: LintFailure},
  highlights: number[][],
  program: string,
  name: string,
  onEdit: (s: string) => void
};
type DefChunksState = {
  chunks: Chunk[],
  chunkIndexCounter: number,
  focusedChunk: number
};

const CHUNKSEP = "#.CHUNK#\n";

export class DefChunks extends React.Component<DefChunksProps, DefChunksState> {
  constructor(props: DefChunksProps) {
    super(props);
    const chunkstrs = this.props.program.split(CHUNKSEP);
    const chunks : Chunk[] = [];
    var totalLines = 0;
    for(let i = 0; i < chunkstrs.length; i += 1) {
      chunks.push({text: chunkstrs[i], id: String(i), startLine: totalLines})
      totalLines += chunkstrs[i].split("\n").length;
    }
    this.state = {
      chunkIndexCounter: chunkstrs.length,
      chunks: chunks,
      focusedChunk: 0
    }
  }
  getStartLineForIndex(chunks : Chunk[], index : number) {
    if(index === 0) { return 1; }
    else {
      return chunks[index - 1].startLine + chunks[index - 1].text.split("\n").length;
    }
  }
  chunksToString(chunks : Chunk[]) {
    return chunks.map((c) => c.text).join(CHUNKSEP);
  }
  render() {
    const appendNewChunk = () => {
      let newChunks : Chunk[] = [];
      const id = String(this.state.chunkIndexCounter);
      this.setState({chunkIndexCounter: this.state.chunkIndexCounter + 1});
      newChunks = this.state.chunks.concat([{text:"", id, startLine: this.getStartLineForIndex(this.state.chunks, this.state.chunks.length)}]);
      this.setState({chunks: newChunks});
      this.setState({focusedChunk: Number(id)});
    }
    const onEdit = (index: number, text: string) => {
      let newChunks : Chunk[] = [];
      newChunks = this.state.chunks.map((p, ix) => {
        if (ix === index) { return {text, id:p.id, startLine: p.startLine}; }
        else { return p; }
      });
      newChunks = newChunks.map((p, ix) => {
        if (ix <= index) { return p; }
        else { return {text: p.text, id: p.id, startLine: this.getStartLineForIndex(newChunks, ix)}; }
      });
      this.setState({chunks: newChunks});
      this.props.onEdit(this.chunksToString(newChunks));
    }
    const onDragEnd = (result: DropResult) => {
      if(result.destination === null || result.source!.index === result.destination!.index) {
        return;
      }
      else {
        // Great examples! https://codesandbox.io/s/k260nyxq9v
        const reorder = (chunks : Chunk[], start : number, end : number) => {
          const result = Array.from(chunks);
          const [removed] = result.splice(start, 1);
          result.splice(end, 0, removed);
          return result;
        };
        if(result.destination === undefined) { return; }
        let newChunks = reorder(this.state.chunks, result.source.index, result.destination.index);
        for(let i = 0; i < newChunks.length; i += 1) {
          const p = newChunks[i];
          newChunks[i] = {text: p.text, id: p.id, startLine: this.getStartLineForIndex(newChunks, i)};
        }
        this.setState({ chunks: newChunks });
        this.props.onEdit(this.chunksToString(newChunks));
      }
    };
    const lastLine = this.getStartLineForIndex(this.state.chunks, this.state.chunks.length);

    const lastChunkId = String(-1) + lastLine;
    const endBlankChunk = {text: "", id: lastChunkId, startLine: lastLine};
    return (<DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="droppable">
        {(provided, snapshot) => {
          return <div
            {...provided.droppableProps}
            ref={provided.innerRef} 
          >{this.state.chunks.concat([endBlankChunk]).map((chunk, index) => {
            if(chunk === undefined || index === undefined) { return; }
            const linesInChunk = chunk.text.split("\n").length;
            let highlights : number[][];
            const name = this.props.name + "_chunk_" + chunk.id;
            let failures : string[] = [];
            if(name in this.props.lintFailures) {
              failures = this.props.lintFailures[name].errors;
            }
            if(this.props.highlights.length > 0) {
              highlights = this.props.highlights.filter((h) => h[0] > chunk.startLine && h[0] <= chunk.startLine + linesInChunk);
            }
            else {
              highlights = [];
            }
            const isLast = (chunk.id.startsWith("-1"));
            const takeFocus = () => {
              if(isLast) { return; }
              this.setState({focusedChunk: index});
            }
            return <Draggable key={chunk.id} draggableId={chunk.id} index={index}>
              {(provided, snapshot) => {
                return (<div ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}><DefChunk
                      takeFocus={takeFocus}
                      focused={this.state.focusedChunk === index}
                      name={name}
                      isLast={isLast}
                      failures={failures}
                      highlights={highlights}
                      startLine={chunk.startLine}
                      key={chunk.id}
                      index={index}
                      chunk={chunk.text}
                      onEdit={onEdit}
                      appendNewChunk={appendNewChunk}></DefChunk></div>)
              }
              }</Draggable>;
          })}</div>;
        }}
      </Droppable></DragDropContext>);
  }
}
