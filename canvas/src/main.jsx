/** @jsxImportSource react */
import React from 'react';
import { CanvasEditor } from './editor.jsx';
import { createRoot } from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import './style.css';

const key = 'voice-canvas-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
let timer;
function save(scene) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(scene));
      document.getElementById('status').textContent = '已保存到当前浏览器';
    } catch {
      document.getElementById('status').textContent = '本地保存失败，请通过菜单导出画布';
    }
  }, 300);
}
function App() {
 return (
  <main>
    <header><strong>画布与 CLI</strong><span>自由绘图 · 命令行控制</span><small id="status">本地画布</small></header>
    <section><CanvasEditor initialData={saved || undefined} onChange={save} commandBridge/></section>
  </main>
 );
}
createRoot(document.getElementById('root')).render(<App/>);
