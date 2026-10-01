# Excalidraw 自由画布

基于 Excalidraw 的本地中文自由画布与 CLI。代码迁自 [scottzx/voice-canvas](https://github.com/scottzx/voice-canvas) 的 `main`（提交 `757f2bc4251a03d373bc4f2a1560be54fd8b6f98`），保留 MIT 许可证。这里是 `@1agents/feature-blueprint` 的功能模块，与思维导图共用根包、锁文件、版本号和发布流程。

## 使用

安装统一包后运行：

```sh
npm install -g @1agents/feature-blueprint
voice-canvas serve
```

打开 `http://127.0.0.1:5178/`，保持一个画布标签在线。在另一终端执行：

```sh
voice-canvas state
voice-canvas add "保留人的主动性" --x 100 --y 100
voice-canvas list
voice-canvas rename ELEMENT_ID "帮助人保持专注"
voice-canvas move ELEMENT_ID --x 400 --y 200
voice-canvas connect FROM_ID TO_ID
voice-canvas select ELEMENT_ID
voice-canvas delete ELEMENT_ID
voice-canvas undo
voice-canvas redo
voice-canvas json '{"op":"add","text":"新想法","x":100,"y":300}'
```

也可用 `blueprint canvas <command>`、`npx @1agents/feature-blueprint canvas <command>` 或在仓库根目录运行 `node canvas/src/cli/canvas.mjs <command>`。`serve` 使用固定端口 5178，终端按 Ctrl-C 停止；不接受其他参数。画布命令返回 JSON，新增元素 ID 位于 `result.createdIds`，`state` 返回元素、选中项和撤销／重做步数。

发布包包含预构建的画布和网页资源，运行时只需 Node.js 22+，无需 Vite、React 开发依赖或模型配置。`@1agents/feature-blueprint/canvas/server` 导出 `serve(port = 5178)`，返回 Node HTTP server，可由其他本机应用启动或关闭。

## 数据与连接

画布仍保存在当前浏览器的 `voice-canvas-v1` localStorage 条目中；同一浏览器和同一地址下保留旧画布。重要内容通过画布菜单导出 `.excalidraw` 备份，浏览器存储不跨设备同步。与思维导图的 `*.blueprint.json` 文件和 DSH Session 存储互相独立。

CLI 通过 `/api/canvas` 和 `/canvas-ws` 把命令转发到网页，等待浏览器执行确认。服务仅监听 `127.0.0.1`，不提供远程访问。只支持一个活动画布连接，多余页面每三秒重试；关闭多余标签可释放连接。

CLI 新增和改名支持独立文字，网页支持 Excalidraw 其他形状；CLI 连线跟随节点位置更新。撤销／重做保留最近 100 次元素快照，刷新后清空历史，图片文件不包含在快照中。正在拖动或编辑文字时拒绝 CLI 写操作，完成编辑后重试。

## 开发与验证

所有命令都在仓库根目录运行：

```sh
npm ci
npm run dev:canvas
npm run build:canvas
npm test
# 已有一个画布标签在线时，额外运行真实画布测试：
npm run test:canvas:cli
```

`npm test` 构建两个功能并执行思维导图测试和画布服务自动测试。真实画布测试覆盖新增、改名、移动、连线、选中、删除、撤销／重做和无效输入，仅清理自己创建的元素。

目录结构：

```text
canvas/
  src/main.jsx              # 独立网页与浏览器持久化
  src/editor.jsx            # 独立网页 / DSH 共用的画布组件
  src/scene.js              # 共享场景校验与快照
  src/commands.js           # 浏览器画布命令与撤销历史
  src/style.css
  src/cli/canvas.mjs         # voice-canvas CLI
  src/server/serve.js        # 发布包静态服务
  src/server/canvas-bridge.js
  tests/                    # 桥接与真实画布测试
  index.html
  vite.config.js
  dist/                     # 生成的网页资源，不提交 Git
```

不迁入旧的语音、转写、Laya 或模型配置；历史实验仍保留在原仓库的 `archive/voice-laya` 分支。统一包的 DSH 插件同时提供思维导图和自由画布入口，并支持 `.excalidraw` 文件预览。DSH 使用独立的 Session store；CLI 仍控制独立网页，二者不自动共享场景。插件说明见 [DSH 集成](../packages/dsh-plugin/README.md)。
