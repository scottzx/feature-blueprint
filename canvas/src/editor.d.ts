import type { ComponentType } from 'react';
import type { CanvasScene } from './scene.js';
export interface CanvasEditorProps {
  initialData?: CanvasScene;
  scene?: CanvasScene;
  onChange?: (scene: CanvasScene) => void;
  readOnly?: boolean;
  theme?: 'light' | 'dark';
  langCode?: string;
  commandBridge?: boolean;
}
export const CanvasEditor: ComponentType<CanvasEditorProps>;
