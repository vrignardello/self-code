const { contextBridge, ipcRenderer } = require('electron');
const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('selfCode', {
  init: invoke('workspace:init'), tree: invoke('workspace:tree'), read: invoke('workspace:read'),
  write: invoke('workspace:write'), create: invoke('workspace:create'), move: invoke('workspace:move'),
  trash: invoke('workspace:trash'), chooseWorkspace: invoke('workspace:choose'),
  saveSession: invoke('session:save'), run: invoke('execution:run'), stop: invoke('execution:stop'),
  closeReady: invoke('window:close-ready'),
  onExecution(callback) { const listener = (_event, value) => callback(value); ipcRenderer.on('execution:event', listener); return () => ipcRenderer.removeListener('execution:event', listener); },
  onCommand(callback) { const listener = (_event, command) => callback(command); ipcRenderer.on('menu:command', listener); return () => ipcRenderer.removeListener('menu:command', listener); },
});
