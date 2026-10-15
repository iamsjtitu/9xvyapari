// Windows/Electron quirk: after a child window or native dialog closes, the page keeps "focus" but
// inputs stop receiving keystrokes until the window is re-focused. Nudge focus back explicitly.
function refocus(win) {
  if (!win || win.isDestroyed()) return;
  setTimeout(() => {
    if (win.isDestroyed()) return;
    if (!win.isFocused()) win.focus();
    win.blur();
    win.focus();
    win.webContents.focus();
  }, 50);
}

module.exports = { refocus };
