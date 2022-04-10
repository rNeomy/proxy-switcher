import './ace-builds-1.4.12/src/ace.js';
import './ace-builds-1.4.12/src/ext-language_tools.js';

class EditorView extends HTMLElement {
  constructor() {
    super();

    const shadow = this.attachShadow({mode: 'open'});
    shadow.innerHTML = `
      <style>
        #host {
          height: 100%;
        }
        #editor {
          background-color: transparent;
        }
        .ace_hidden-cursors {
          opacity:0
        }
      </style>
      <div id="host">
        <div id="editor"></div>
      </div>
    `;

    ace.config.set('basePath', (new URL(import.meta.url + '/../ace-builds-1.4.12/src/')).href);
    ace.require('ace/ext/language_tools');

    const editor = this.editor = ace.edit(shadow.getElementById('editor'), {
      mode: 'ace/mode/javascript',
      autoScrollEditorIntoView: true,
      highlightActiveLine: false,
      maxLines: 100,
      value: '\n',
      keyboardHandler: 'ace/keyboard/sublime',
      enableBasicAutocompletion: true,
      enableSnippets: true,
      enableLiveAutocompletion: false,
      useWorker: false
    });
    editor.renderer.attachToShadowRoot();
    let lastCursor = {};
    this.addEventListener('keyup', e => {
      const cursor = this.cursor;
      if (cursor.row === lastCursor.row && cursor.column === lastCursor.column) {
        if (e.code === 'ArrowUp') {
          this.dispatchEvent(new Event('hit-start'));
        }
        else if (e.code === 'ArrowDown') {
          this.dispatchEvent(new Event('hit-end'));
        }
      }
      lastCursor = cursor;
    });
    // auto complete
    editor.on('change', () => {
      const cursor = this.cursor;
      const token = editor.session.getTokenAt(cursor.row, cursor.column);
      if (token && token.value.length >= 2 && token.type === 'identifier') {
        editor.execCommand('startAutocomplete');
      }
    });
  }
  get value() {
    return this.editor.getValue();
  }
  set value(v) {
    // move cursor to end
    this.editor.setValue(v, 1);
  }
  get cursor() {
    return this.editor.getCursorPosition();
  }
}
window.customElements.define('editor-view', EditorView);
