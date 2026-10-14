const { Menu, shell, app, dialog } = require("electron");

function buildMenu({ getWin, services, checkUpdates, changeFolder }) {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Print Preview...",
          accelerator: "CmdOrCtrl+P",
          click: () => getWin()?.webContents.send("print:request"),
        },
        { type: "separator" },
        { label: "Data Folder kholein", click: () => shell.openPath(services.dataDir) },
        { label: "Backups Folder kholein", click: () => shell.openPath(services.backupDir) },
        { label: "DOS Backup Folder kholein (DBF files yahan rakhein)", click: () => shell.openPath(services.dosDir) },
        { label: "Logs Folder kholein", click: () => shell.openPath(services.logDir) },
        { type: "separator" },
        { label: "Data Folder Badlein... (restart)", click: () => changeFolder() },
        { type: "separator" },
        { role: "quit", label: "Band Karein" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload" },
        { role: "togglefullscreen", label: "Full Screen" },
        { type: "separator" },
        { role: "zoomIn", label: "Zoom In" },
        { role: "zoomOut", label: "Zoom Out" },
        { role: "resetZoom", label: "Zoom Reset" },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Update Check Karein", click: () => checkUpdates() },
        { role: "toggleDevTools", label: "Developer Tools" },
        { type: "separator" },
        {
          label: "About 9x Vyapari",
          click: () =>
            dialog.showMessageBox(getWin(), {
              type: "info",
              title: "9x Vyapari",
              message: `9x Vyapari v${app.getVersion()}${services.portable ? " (Portable)" : ""}`,
              detail: `Galla / Kaccha Arhat Hisab Kitab – Offline Desktop\n\nData: ${services.dataDir}\nServer: ${services.url}`,
            }),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
