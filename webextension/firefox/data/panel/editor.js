/* globals ui */
'use strict';

// basic editor features
ui.pac.editor.addEventListener('keydown', e => {
  if (e.keyCode === 9 || e.which === 9) {
    e.preventDefault();
    const editor = e.target;
    const s = editor.selectionStart;
    editor.value = editor.value.substring(0, editor.selectionStart) +
      '\t' +
      editor.value.substring(editor.selectionEnd);
    editor.selectionEnd = s + 1;
  }
});
ui.pac.editor.addEventListener('keyup', e => {
  if (e.keyCode === 13 || e.which === 13) {
    const editor = e.target;
    const s = editor.selectionStart;
    const ss = editor.value.substring(0, editor.selectionStart);
    let spaces = '';
    try {
      spaces = /([ \t]*).*\n$/.exec(ss)[1];
    }
    catch (e) {}
    editor.value = ss + spaces + editor.value.substring(editor.selectionEnd);
    editor.selectionEnd = s + spaces.length;
  }
  if (e.keyCode === 222 || (e.keyCode === 57 && e.shiftKey) || (e.keyCode === 219 && e.shiftKey)) {
    const editor = e.target;
    const s = editor.selectionStart;
    let ch = ')';
    if (e.keyCode === 222 && e.shiftKey) {
      ch = '"';
    }
    else if (e.keyCode === 222) {
      ch = '\'';
    }
    else if (e.keyCode === 219) {
      ch = '}';
    }
    editor.value = editor.value.substring(0, editor.selectionStart) +
      ch +
      editor.value.substring(editor.selectionEnd);
    editor.selectionEnd = s;
  }
});
