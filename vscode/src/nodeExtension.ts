import * as vscode from 'vscode';
import { addPaneModules } from './pyretCPOWebEditor';
import { makeHttpModule } from './httpBridge';
import { activate as activateWeb } from './webExtension';

export function activate(context: vscode.ExtensionContext) {
  addPaneModules(makeHttpModule);
  activateWeb(context);
}
