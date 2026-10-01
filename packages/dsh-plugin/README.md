# DSH Feature Blueprint

DSH 插件随统一包 `@1agents/feature-blueprint` 一起发布，与 `blueprint` CLI 共用版本号；本目录是源码目录，不单独发布 `@1agents/dsh-feature-blueprint`。

把共享功能蓝图编辑器及文件查看器注册到 DeepSeek Harness 现有右侧边栏。打开会话后，在右侧边栏的开始页选择“功能蓝图”，即可添加模块、添加功能点、重命名、删除叶节点、展开折叠和拖拽调整层级。

顶部可切换列表与思维导图，两种视图共享节点、选择和折叠状态。思维导图提供横向层级连线、画布滚动与 50%–150% 缩放；“添加一级模块”按钮可直接新增根模块，选中模块后继续添加子模块或功能点。文件预览同样支持切换与缩放。

每个模块和功能点都支持多行备注，保存为节点的可选 `notes` 字段。新增时可填写，选中节点后可查看全文并点击“编辑备注”修改或清空；切换视图、重命名和拖拽均保留备注。文件预览可查看备注，修改使用 `blueprint notes <file> --id <id> --text <text>`。

## 构建和配置

在组件根目录运行 `npm run build` 和 `npm run build:plugin`。插件包的 Host 入口只声明浏览器插件；发布的 Client 文件包含共享组件和 Preact，通过 DSH 的 ModuleLoader 使用宿主 React、store 和图标库。

在 DSH 使用的隔离 Web profile 中安装 `@1agents/feature-blueprint`，然后通过普通 `dsh web --patch <overlay>` 启动。本地开发时将组件根目录链接到该 profile 的 `node_modules/@1agents/feature-blueprint`。overlay 内容如下：

```yaml
- insert:
    - id: oneagents-feature-blueprint
      name: '@1agents/feature-blueprint'
```

根包的 `cordis.patch.yml` 声明相同 bundle，`./client` export 指向构建的 Client 文件，根入口同时导出 Host 所需的空 `apply`。插件不改动 DSH 默认 profile；类型、正文、字典和样式均通过可释放的 effect 注册。

## 打开本地蓝图文件

在组件根目录通过 `node cli/blueprint.mjs` 创建和修改 `*.blueprint.json`，命令及格式见 [组件说明](../../README.md#本地文件与-cli)。在 DSH 当前会话的工作区文件列表打开该文件，文档预览会按 `blueprint.json` 复合后缀自动选择功能蓝图。普通 JSON 文件仍使用其原有预览；蓝图文件也可切换为文本查看器。

文件正文使用共享读取器完整加载 UTF-8 JSON，并校验 format、version、节点字段及层级。损坏文件和不支持的版本在正文显示错误，不隐式修复。选择、展开和折叠只影响当前视图；文件视图不允许拖拽或修改。Agent 使用 CLI 编辑文件，DSH 文件预览的自动刷新开启时会跟随变化；关闭自动刷新时使用文档工具栏的重新加载按钮。文件访问范围和读取大小上限由宿主工作区服务控制。

插件依赖现有 `documentPreviews` 服务，按可释放 effect 注册文件后缀与正文。它没有额外 Host 文件接口，也不绕过会话文件权限。

## 浏览器编辑器的数据和模型

侧边栏开始页的编辑器与文件预览分开。每个 Session 有一份浏览器蓝图；同一 Session 的多个窗格共享节点。数据由 DSH store 保存在当前浏览器的 `oneagents.feature-blueprint.v1.<sessionId>` localStorage 条目中，已提交 Session 的数据可在重新打开时恢复。尚未提交的草稿会话可能在刷新后获得新的 id，不能用作长期保存目的地。读取存储数据时验证节点字段、唯一 id、父节点类型、无环层级和九级模块上限。

蓝图不跨浏览器同步，不进入 Session 日志，也不向模型请求添加内容。不连接 1agents 的任务和版本服务，浏览器编辑器不提供 AI 自动修改或撤销；Agent 可通过普通 shell 使用 CLI 操控本地蓝图文件。卸载插件保留浏览器里的节点；删除浏览器站点数据会删除这些节点。

## 维护

共享组件的行为在根目录 `npm test` 中验证；插件注册测试检查卸载后类型、文件查看器、正文、字典和样式均移除。CLI 测试使用真实子进程验证读写、错误不改文件、修订冲突和并发写入。Client 源码的类型检查需要 DSH 的当前 peer 声明。构建时不要把 React 或 DSH 平台模块打入私有副本；样式限定在编辑器和插件容器内。
