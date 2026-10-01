# Mind Map

一个 MIT npm 包，包含思维导图、Excalidraw 自由画布、各自的 CLI 和独立浏览器编辑器，以及提供两个侧栏入口的 DSH 插件，统一名称及版本号：`@1agents/feature-blueprint`。CLI 和独立编辑器需要 Node.js 22+；使用它们无需安装或启动 DSH。

```sh
npm install -g @1agents/feature-blueprint
blueprint init product.blueprint.json
blueprint open product.blueprint.json
```

也可不全局安装：`npx @1agents/feature-blueprint open product.blueprint.json`。

产品名称为“思维导图”（Mind Map）。包名 `@1agents/feature-blueprint`、CLI 命令 `blueprint`、`*.blueprint.json` 文件格式及已有浏览器存储保持兼容，现有文件和会话数据可继续使用。

从 1agents App 思维导图抽出的树形组件。提供大纲和思维导图两种展示，保留模块／功能点层级、展开折叠，以及拖到节点前面、后面、内部或一级目录的交互。树形计算不依赖 DOM、前端框架、项目任务或后端接口。

## 组成

| 入口 | 用途 |
| --- | --- |
| `@1agents/feature-blueprint` | 构建树、筛选、父节点候选、拖拽校验和纯数据移动 |
| `@1agents/feature-blueprint/preact` | 受控 `BlueprintTree`，供 1agents 原页面使用 |
| `@1agents/feature-blueprint/editor` | 独立 `BlueprintEditor`，提供新增、重命名、叶节点删除和拖拽 |
| `@1agents/feature-blueprint/mount` | `mountBlueprint(element, props)`，供 React 或原生页面嵌入 |
| `@1agents/feature-blueprint/style.css` | 独立编辑器的作用域样式 |
| `@1agents/feature-blueprint/document` | 同一套文件格式和层级校验，供 CLI、浏览器和其他调用方复用 |
| `@1agents/feature-blueprint/schema.json` | 文件字段的 JSON Schema；图关系由共享校验器检查 |
| `blueprint` | 本地文件读写、增删改名和层级移动，返回 JSON |
| `blueprint open <file>` | 启动独立浏览器编辑器，直接保存本地文件 |
| [DSH 插件](packages/dsh-plugin/README.md) | 思维导图、自由画布两个侧栏入口及对应文件预览 |
| `voice-canvas` / `blueprint canvas` | Excalidraw 自由画布、CLI 和本地 HTTP / WebSocket 桥接 |
| `@1agents/feature-blueprint/canvas/server` | `serve(port)`，启动独立画布服务 |
| [自由画布模块](canvas/README.md) | 独立维护的画布源码与集成测试，使用根包统一构建和发布 |

## Excalidraw 自由画布

自由画布源码从 `scottzx/voice-canvas` 的 `main` 迁入 `canvas/`，与思维导图共用根目录的 `package.json`、锁文件、版本和发布工作流。安装一次即可使用两个功能；画布模块没有单独的 npm 包或发布流程。

```sh
npm install -g @1agents/feature-blueprint
voice-canvas serve
# 在浏览器打开 http://127.0.0.1:5178/，另一个终端执行：
voice-canvas add "新想法" --x 100 --y 100
voice-canvas state
```

不全局安装时可用 `npx @1agents/feature-blueprint canvas serve` 和 `npx @1agents/feature-blueprint canvas state`。`blueprint` 与 `feature-blueprint` 是同一思维导图 CLI 的两个入口，后者保证多命令包仍能通过 `npx @1agents/feature-blueprint ...` 调用。

自由画布与思维导图保持各自的数据格式和浏览器资源。画布使用原来的 `voice-canvas-v1` localStorage 键，仍需保持一个画布标签在线，CLI 才能操作。DSH 插件同时提供自由画布入口和 `*.excalidraw` 文件预览；会话画布按需加载并跟随宿主主题。详细命令、数据保存和测试说明见 [画布说明](canvas/README.md)。

## 本地文件与 CLI

一份思维导图对应一个 `*.blueprint.json` 文件，示例见 [product.blueprint.json](examples/product.blueprint.json)。顶层固定为 `format: "1agents.feature-blueprint"`、`version: 1` 和 `nodes`。节点包含稳定 `id`、`kind`（`module` 或 `feature`）、`title`、非负整数 `position`、UTC 毫秒格式的 `createdAt`，子节点额外包含 `parentId`。模块和功能点均可添加可选的 `notes: string` 备注，支持多行纯文本及空字符串；省略时表示没有备注，旧文件无需迁移。同级节点按 `position`、`createdAt`、`id` 排序；移动会重新编号受影响的同级节点。最多九级模块，功能点是模块下的叶节点。可选 `links` 数组保存关联：`{kind:"web",url,title?}`、`{kind:"node",nodeId}`、`{kind:"note",noteId,title,url?,content?}`。网页只接受 HTTP(S) URL；节点引用允许目标已删除，以保留资料痕迹。未知文档及节点字段会在修改时保留，可用于宿主元数据；它们不自动进入树的展示。

Agent 可直接编辑 JSON 后运行 `validate`，也可使用下列命令。在源码目录中通过 `node cli/blueprint.mjs` 调用；安装包后命令名是 `blueprint`。

```sh
node cli/blueprint.mjs init product.blueprint.json
node cli/blueprint.mjs add product.blueprint.json --id accounts --kind module --title '账号'
node cli/blueprint.mjs add product.blueprint.json --id login --kind feature --parent accounts --title '登录'
node cli/blueprint.mjs rename product.blueprint.json --id login --title '密码登录'
node cli/blueprint.mjs notes product.blueprint.json --id login --text '支持邮箱或手机号登录'
node cli/blueprint.mjs list product.blueprint.json
node cli/blueprint.mjs validate product.blueprint.json
```

`move --id login --inside accounts` 移到模块内部；`--before <id>` 和 `--after <id>` 调整顺序；`--root` 把模块移回顶层。`remove --id <id>` 只删除叶节点，`--subtree` 明确删除整个子树。`show` 返回完整文档，`list` 返回按树顺序排列的简洁节点，`schema` 输出 JSON Schema，`--help` 说明所有操作。文件命令的标准输出为 JSON；错误输出到 stderr，退出码为 1。

`add` 可同时传入 `--notes <text>`；`notes --id <id> --text <text>` 修改备注，`--text ''` 清空备注，也支持 `--expect-revision`。`show` 和 `list` 均返回节点已有的备注；重命名、排序和层级移动保留备注及其他字段。

读取命令和成功修改均返回 `revision`，它是文件字节的 SHA-256。Agent 先读后改时，可把它传给 `--expect-revision`，旧版本会被拒绝；未传时命令修改当前磁盘版本。所有 CLI 写操作使用同目录锁和临时文件，成功后原子替换，`init` 从不覆盖已有文件。已有符号链接通过真实目标修改，保留链接。正在写入时其他命令立即失败；异常中止可能留下 `<file>.lock`，确认没有写入进程后可手动删除。其他编辑器不参与此锁协议，仍可能在最后一次检查与替换之间竞争；需要统一并发保证的调用方应全部使用 CLI。

文件是持久数据源，可以放入项目和 Git。DSH 打开同一文件后显示思维导图，CLI 修改由文件预览的自动刷新机制反映到页面；文件预览不保存另一份思维导图。它支持选择、展开、折叠以及拖拽、新增、重命名和备注编辑，修改直接写回原文件。保存检查文件版本，冲突或权限错误会显示提示并提供未保存修改的下载。浏览器本地编辑器仍是独立的临时工作区，详见插件说明。

## 独立浏览器编辑器

`blueprint open <file.blueprint.json>` 打开已存在且通过校验的思维导图文件，默认显示思维导图，也可切换大纲。新增、删除、重命名、备注和拖拽操作直接保存到该文件，保留文档及节点扩展字段。编辑器每两秒读取一次文件，跟随 CLI 或外部编辑器的修改，不使用 localStorage 保存另一份节点。

命令先输出 `{ ok, path, url }` JSON，再保持服务运行；关闭网页不会停止服务，终端按 Ctrl-C 停止。默认自动选择空闲端口并打开系统浏览器；`--no-browser` 仅输出 URL，`--port 4178` 指定端口。服务只监听 `127.0.0.1`，只读写传入的文件，不提供目录或任意路径接口。提交包含文件修订号，冲突不会覆盖文件；保存失败时页面提供下载未保存修改的入口。单次浏览器提交最多 10 MiB。

## 开发

在本目录运行：

```sh
npm install
npm run build
npm test
npm run build:demo
npm run build:plugin
npm run dev:canvas
```

`demo-dist/index.html` 必须经 HTTP 静态服务器访问。演示数据只保存在当前页面内存中；刷新回到示例树。

这个目录是独立的 npm 项目。1agents 前端在本地开发时通过 `portal:../../services/feature-blueprint` 引用它；构建原前端前必须先构建本包，并保留两个目录的相对位置。其他消费者可直接安装 npm 包。源码构建生成模型声明、思维导图浏览器资源、Excalidraw 画布资源和 DSH client，发布包已包含这些产物，用户无需构建。组件消费者需自行安装 `preact`；它是可选 peer，不影响独立 CLI。

## 调用

```ts
import { buildFeatureTree, moveFeatureNode } from '@1agents/feature-blueprint';
import type { BlueprintNode } from '@1agents/feature-blueprint';

const nodes: BlueprintNode[] = [
    { id: 'account', kind: 'module', title: '账号', position: 0, createdAt: '' },
    { id: 'login', kind: 'feature', title: '登录', parentId: 'account', position: 0, createdAt: '' },
];
const tree = buildFeatureTree(nodes);
const moved = moveFeatureNode(nodes, 'login', { targetId: 'account', placement: 'inside' });
```

节点必须具有唯一 id、有效的模块父节点和无环层级；功能点必须位于模块下。核心函数接受经过验证的数据，默认最多九级模块，功能点不计入模块层数。泛型投影保留调用方的其他字段。移动不会修改原数组或原节点，受影响的同级节点会重新编号，无效或未改变的移动返回原数组。

`BlueprintTree` 接收完整 `nodes` 和用于展示的 `tree`。筛选时应禁用拖拽，同时展开命中节点的祖先。选择和折叠状态由调用方控制；`onMove(id, move, target)` 负责保存、重新读取和报告失败，必须自行处理失败并使 Promise 正常结束。组件不访问 API，不保存业务数据，也不删除节点。调用方通过 `renderProgress`、`renderActions` 注入业务内容，所有可见和辅助文案通过 `labels` 提供。

`mountBlueprint` 要求一个由编辑器独占的空 DOM 元素。React 父组件只管理容器，通过 `update(props)` 更新数据，通过 `dispose()` 卸载 Preact 子树；两个框架不共享 hooks。`BlueprintEditor` 的 `onChange` 同步提交新节点，宿主负责存储；`readOnly` 文件模式隐藏编辑控件并禁用拖拽。保存到远端的页面应使用受控树，并由宿主管理待保存状态和错误。

编辑器默认使用大纲视图（API 保持 `list` 名称兼容已有宿主）。提供 `labels.views` 后显示大纲/导图切换与 50%–150% 缩放；`initialView: 'mindmap'` 设置首次展示。两种视图共享节点、选择、折叠、搜索和关联资料，切换不修改文件。点击中心标题清空选择；添加一级模块可直接新增根模块。文件编辑支持搜索、切换、折叠、缩放与关联跳转，编辑操作自动写回文件。直接使用 `BlueprintTree` 的宿主可传入 `presentation: 'mindmap'`，并自行提供画布容器与共享样式。

DSH 会话侧栏使用 `canvasOnly: true`，仅显示画布和悬浮控件；选择节点后可编辑或按需查看关联资料。DSH 的 `*.blueprint.json` 文件侧栏同样使用纯画布，节点修改仍自动保存到文件；独立编辑器保留完整工具。宿主也可通过 `initialZoom` 设置初始缩放（自动限制在 50%–150%）。演示提供完整工作台与 `?mode=sidebar` 侧栏预览。

鼠标位于导图画布内时，滚轮向上放大、向下缩小，以鼠标位置为缩放中心；触控板捏合也可缩放。按住 Shift 使用滚轮可横向移动画布，缩放范围为 50%–150%。大纲视图和画布外的滚动行为保持正常。

提供可选 `labels.tools` 启用搜索、层级折叠、关联资料和笔记目录工具（独立编辑器、演示和 DSH 已启用）。标签类型见 `BlueprintEditorLabels`，预置中英文见 `src/labels.ts`。

- 搜索节点标题、备注、关联标题/URL及笔记快照；结果保留父级路径并展开，清除后恢复原折叠。搜索期间禁用拖拽，避免隐藏同级项引起误操作。
- 全部展开、全部折叠，或选择显示到第 1–9 层。
- 选中并聚焦节点：Enter 添加同级节点，Tab 添加子模块，F2 重命名，方向键导航/展开折叠，Escape 取消编辑；双击节点也可编辑。功能点保持叶节点语义，九级模块上限仍生效。
- 任意节点可关联 HTTP(S) 网页、导图中的其他节点，或宿主/导入列表中的笔记。关联使用稳定 ID，并显示反向节点引用；点击节点引用会展开目标路径。被删除的目标显示为不可用，可移除关联。
- “生成笔记目录”在宿主提供 `notebook` 时直接追加分组目录；否则选择 JSON 笔记列表后生成。再次点击可为当前列表生成一份新的目录，不覆盖既有节点。目录保存笔记引用和正文快照；原笔记的后续修改不会自动同步。

笔记列表格式示例见 [notebook.json](examples/notebook.json)：

```json
{
  "title": "研究笔记",
  "notes": [
    { "id": "note-1", "title": "访谈", "section": "调研", "content": "笔记正文", "url": "https://example.com/notes/1" }
  ]
}
```

`section`、`content`、`url` 可省略，笔记 ID 须唯一。宿主可向 `BlueprintEditor`/`mountBlueprint` 提供同格式的 `notebook`，并通过 `onOpenNote(noteId)` 接入自己的笔记导航；未提供回调时打开笔记 URL，或显示正文快照。项目没有内置笔记本后端，导入的列表仅在当前编辑器生命周期中供再次生成和选择关联，生成的节点与快照则随文件/Session 持久化。纯函数 `readBlueprintNotebook` 和 `appendNotebookDirectory` 从根入口导出。

节点备注在两种视图中展示摘要。宿主提供可选的 `labels.notes: { label, edit, empty }` 后，可在新增或重命名时填写备注，也可选中任意节点后使用“编辑备注”单独修改或清空。选中节点显示完整备注，文件预览同样可以查看。备注按纯文本显示，保留换行与空格，保存通过同一 `onChange` 回调交给宿主。

1agents 原页面继续管理任务、需求关联、交付进度、版本、历史、表单和 AI PM 操作，并使用已有 CSS 类。它与共享组件必须使用同一个 Preact runtime；前端构建显式把 `preact` 解析到应用自己的依赖。

## 限制

原生 HTML 拖拽面向鼠标操作；没有新增触屏拖拽。独立编辑器只删除没有子节点的节点，不提供撤销或业务历史。DSH 插件不自动读取 1agents 项目数据，不注册模型工具，也不修改 Session 日志；其浏览器存储行为见插件说明。

## 发布

GitHub 仓库：[scottzx/feature-blueprint](https://github.com/scottzx/feature-blueprint)。`main` 的 push 和 PR 运行 CI；推送与 `package.json` 对应的 `v<version>` tag，或手动运行 `Publish npm` 工作流，会在类型检查、测试及打包检查通过后以 provenance 发布唯一的 `@1agents/feature-blueprint` 包。npm 发布凭据从 GitHub Actions 的 `NPM_TOKEN` secret 读取，源码不包含凭据。DSH 插件、思维导图 CLI 和画布 CLI 使用该包相同的版本号，`packages/dsh-plugin` 只保留插件源码和开发资料，不单独发布。

MIT 协议见 [LICENSE](LICENSE)，打包的 Preact、React 和 Excalidraw 等许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
