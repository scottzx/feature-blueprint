/** @jsxImportSource react */
import React, { useEffect, useRef, useState } from 'react';
import { Excalidraw, CaptureUpdateAction } from '@excalidraw/excalidraw';
import { connectCommands } from './commands.js';
import { readCanvasScene, snapshotCanvas } from './scene.js';

/** Shared canvas surface; each host supplies persistence and decides whether to connect the CLI. */
export function CanvasEditor({ initialData, scene, onChange, readOnly = false, theme = 'light', langCode = 'zh-CN', commandBridge = false }) {
  const host = useRef(null);
  const [api, setApi] = useState(null);
  const [initial] = useState(() => initialData ? readCanvasScene(initialData) : undefined);
  const signature = useRef(initial ? JSON.stringify(initial) : null);
  useEffect(() => api && commandBridge ? connectCommands(api, host.current) : undefined, [api, commandBridge]);
  useEffect(() => {
    if (!api || !scene) return;
    const next = readCanvasScene(scene);
    const serialized = JSON.stringify(next);
    if (serialized === signature.current) return;
    signature.current = serialized;
    api.addFiles(Object.values(next.files));
    api.updateScene({ elements: next.elements, appState: next.appState, captureUpdate: CaptureUpdateAction.NEVER });
  }, [api, scene]);
  return <div ref={host} className="oneagents-canvas-surface" style={{ width: '100%', height: '100%', minHeight: 0 }}>
    <Excalidraw excalidrawAPI={setApi} initialData={initial} langCode={langCode} theme={theme}
      viewModeEnabled={readOnly} UIOptions={{ canvasActions: { toggleTheme: false } }}
      onChange={(elements, appState, files) => {
        const next = snapshotCanvas(elements, appState, files);
        const serialized = JSON.stringify(next);
        if (serialized === signature.current) return;
        signature.current = serialized;
        if (!readOnly) onChange?.(next);
      }} />
  </div>;
}
