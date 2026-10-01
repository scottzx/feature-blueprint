/** Standalone demonstration, with data held only by this page. */
import { mountBlueprint } from '../src/mount.js';
import type { BlueprintNode } from '../src/model.js';
import type { BlueprintEditorLabels } from '../src/editor.js';

const labels: BlueprintEditorLabels = {
    tree: '功能蓝图树', rootDrop: '将模块拖到这里，移回一级目录', expand: title => `展开${title}`, collapse: title => `折叠${title}`,
    addModule: '添加模块', addFeature: '添加功能点', rename: '重命名', remove: '删除', name: '名称',
    save: '保存', cancel: '取消', empty: '添加模块，开始整理功能蓝图', module: '模块', feature: '功能点',
    views: { label: '蓝图视图', list: '列表', mindmap: '思维导图', zoomIn: '放大', zoomOut: '缩小', resetZoom: '重置缩放', addRoot: '添加一级模块' },
    notes: { label: '备注', edit: '编辑备注', empty: '暂无备注' },
};
let nodes: readonly BlueprintNode[] = [
    { id: 'accounts', title: '用户与权限', kind: 'module', position: 0, createdAt: '' },
    { id: 'login', title: '登录', kind: 'module', parentId: 'accounts', position: 0, createdAt: '' },
    { id: 'password', title: '密码登录', notes: '支持邮箱或手机号登录\n连续失败后显示验证码', kind: 'feature', parentId: 'login', position: 0, createdAt: '' },
    { id: 'sms', title: '短信登录', kind: 'feature', parentId: 'login', position: 1, createdAt: '' },
    { id: 'workspace', title: '工作区', kind: 'module', position: 1, createdAt: '' },
    { id: 'files', title: '文件管理', kind: 'feature', parentId: 'workspace', position: 0, createdAt: '' },
];
const onChange = (next: readonly BlueprintNode[]) => { nodes = next; editor.update({ nodes, labels, onChange }); };
const editor = mountBlueprint(document.getElementById('app')!, { nodes, labels, onChange });
