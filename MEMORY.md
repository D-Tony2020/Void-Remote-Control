# MEMORY.md — Void Remote Control 项目交接文档

> 供下一个 Claude Code 实例快速上手的完整项目记忆。

---

## 项目概述

**Void Remote Control** 是一个 Chrome/Edge 浏览器扩展，通过摄像头识别手势来控制网页滚动，用于长文阅读场景。核心技术栈：MediaPipe HandLandmarker + Manifest V3。

## 目录结构

```
Void-Remote-Control/
├── build.js                    # 构建脚本（复制 src → dist，提取 MediaPipe WASM）
├── package.json                # 唯一依赖：@mediapipe/tasks-vision
├── src/                        # 源代码
│   ├── manifest.json           # MV3 扩展清单
│   ├── background.js           # Service Worker：消息路由
│   ├── content/content.js      # 内容脚本：平滑滚动执行
│   └── sidepanel/
│       ├── sidepanel.html      # 侧边栏 UI（中文界面）
│       ├── sidepanel.js        # 核心逻辑：手势识别 + 滚动控制
│       └── sidepanel.css       # 暗色主题样式
├── dist/                       # 构建产物（已提交到 git，可直接加载）
│   ├── libs/vision_bundle.mjs  # MediaPipe 捆绑包
│   └── libs/wasm/              # MediaPipe WASM 文件
└── MEMORY.md                   # 本文件
```

## 架构与数据流

```
摄像头 → MediaPipe HandLandmarker (sidepanel.js)
  → 手势识别（张开手掌=控制，握拳=暂停）
  → 手掌Y轴位移 → 死区过滤 → 指数平滑 → 滚动速度
  → chrome.runtime.sendMessage → background.js 路由
  → content.js → window.scrollBy() 平滑滚动
```

## 关键设计决策

### 手势识别逻辑 (`sidepanel.js`)
- **手掌张开判定**：4根手指（食/中/无名/小指）中 ≥3 根伸展即为"张开"
- **滚动控制**：基于手掌中心 Y 轴逐帧位移量，非绝对位置
- **死区**：位移 < deadzone 像素时忽略，防止手抖
- **平滑**：指数加权 `smoothedDelta = old*0.6 + new*0.4`
- **速度公式**：`scrollSpeed = smoothedDelta * sensitivity * 0.5`
- **节流**：滚动指令限制在 ~30fps（33ms 间隔）

### MediaPipe 初始化
- 模型从远程下载：`https://storage.googleapis.com/mediapipe-models/hand_landmarker/...`
- **GPU → CPU 自动降级**：先尝试 GPU delegate，失败后回退 CPU
- WASM 文件本地打包在 `dist/libs/wasm/`

### MV3 扩展配置要点
- `permissions`: activeTab, sidePanel, scripting
- `host_permissions`: `https://storage.googleapis.com/*`（模型下载必需）
- `content_security_policy`: 必须包含 `wasm-unsafe-eval`（MediaPipe WASM 运行必需）

## 已解决的问题（按时间顺序）

### 1. WASM 加载失败 — CSP 拦截
**症状**：`CompileError: WebAssembly.instantiate() violates CSP`
**原因**：MV3 默认 CSP 不允许 WASM 编译
**修复**：manifest.json 添加 `"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"`

### 2. 持续显示"加载中" — 多因素
**症状**：点击"启动追踪"后按钮一直显示"加载中..."，永不恢复
**根因与修复**：
- **GPU delegate 挂死**：添加 GPU→CPU 自动降级（`delegates = ['GPU', 'CPU']` 循环尝试）
- **视频元数据竞态**：`video.play()` 前等待 `onloadedmetadata` 事件，确保 `videoWidth/videoHeight` 有效
- **无超时机制**：添加 `withTimeout()` 工具函数（WASM 15s，模型 30s，摄像头 10s）
- **缺少 host_permissions**：模型下载需要 `googleapis.com` 权限
- **摄像头权限拒绝无友好提示**：针对 NotAllowedError/NotFoundError/NotReadableError 分别给出中文提示

### 3. dist/ 未纳入版本控制
**修复**：从 `.gitignore` 移除 `dist/`，提交构建产物，用户 clone 后可直接加载

## 当前状态

- **分支**：`claude/gesture-scroll-control-G2Huo`
- **版本**：1.0.1
- **构建**：`npm install && node build.js`（或直接用 dist/）
- **已知遗留**：无单元测试，无 README.md

## 构建与使用

```bash
# 构建
npm install
node build.js

# 使用
# Edge: edge://extensions → 开发人员模式 → 加载解压缩的扩展 → 选择 dist/
# Chrome: chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选择 dist/
```

## Git 提交历史

```
f6670be fix: resolve stuck loading and improve robustness across all components
e624a45 fix: add wasm-unsafe-eval CSP to allow WebAssembly loading
056a36d chore: include dist/ in repo so users can load extension directly
15967e2 fix: add Edge browser support and update build instructions
6aa3cb1 feat: implement gesture-based browser scroll control extension
```

## 注意事项

- `.gitignore` 已移除 `dist/`，构建产物直接在仓库中
- 模型文件（~12MB）是远程下载的，不在仓库中；首次启动需要网络
- 侧边栏（side panel）中的摄像头权限弹窗在某些浏览器版本中可能不显示，用户需手动在设置中允许
- `sendScrollCommand` 中 `chrome.runtime.sendMessage` 已加 `.catch()` 防止扩展上下文失效时报错
