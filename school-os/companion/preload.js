const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("jarvis", {
  config: () => ipcRenderer.invoke("config"),
  ask: (messages) => ipcRenderer.invoke("ask", messages),
  transcribe: (bytes, mime) => ipcRenderer.invoke("transcribe", bytes, mime),
  speak: (text) => ipcRenderer.invoke("speak", text),
  open: (url) => ipcRenderer.invoke("open", url),
  hide: () => ipcRenderer.invoke("hide"),
  onFocus: (fn) => ipcRenderer.on("focus-input", fn),
});
