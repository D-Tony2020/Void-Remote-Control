# Void Remote Control

通过摄像头手势控制网页滚动的 Chrome / Edge 浏览器扩展，专为长文阅读场景设计。

张开手掌即可控制滚动，握拳暂停——解放你的双手。

---

## 功能特性

- **手势识别**：基于 MediaPipe HandLandmarker，实时检测手掌状态
- **平滑滚动**：死区过滤 + 指数平滑算法，消除手部抖动
- **侧边栏操作**：所有控制集中在浏览器侧边栏，不遮挡页面内容
- **GPU 加速**：优先使用 GPU 推理，自动降级到 CPU
- **暗色主题**：简洁的紫色调暗色 UI
- **多浏览器支持**：兼容 Chrome、Edge 及其他 Chromium 内核浏览器

## 手势说明

| 手势 | 动作 |
|------|------|
| 伸出食指和中指 | 进入滚动控制模式 |
| 食指在上方倾斜 | 页面向下滚动 |
| 中指在上方倾斜 | 页面向上滚动 |
| 两指水平 | 停止滚动 |
| 收回手指 | 暂停控制 |

两指倾斜角度越大，滚动速度越快。手不需要移动，只需倾斜即可控制。

## 安装

### 方式一：直接加载（推荐）

仓库已包含构建产物，克隆后即可使用：

```bash
git clone https://github.com/D-Tony2020/Void-Remote-Control.git
```

然后在浏览器中加载 `dist/` 目录：

- **Chrome**：打开 `chrome://extensions` → 开启「开发者模式」→ 点击「加载已解压的扩展程序」→ 选择 `dist/` 文件夹
- **Edge**：打开 `edge://extensions` → 开启「开发人员模式」→ 点击「加载解压缩的扩展」→ 选择 `dist/` 文件夹

### 方式二：从源码构建

```bash
git clone https://github.com/D-Tony2020/Void-Remote-Control.git
cd Void-Remote-Control
npm install
node build.js
```

构建完成后，按上述步骤加载 `dist/` 目录。

## 使用方法

1. 安装扩展后，点击浏览器工具栏中的扩展图标，打开侧边栏
2. 点击 **「启动追踪」** 按钮（首次使用需允许摄像头权限）
3. 等待模型加载完成（首次需下载约 12MB 的手势模型，需要网络连接）
4. 将手对准摄像头，伸出食指和中指即可开始控制
5. 倾斜两指控制滚动方向和速度（食指在上 → 向下滚，中指在上 → 向上滚）
6. 收回手指暂停滚动
7. 点击 **「停止追踪」** 关闭摄像头

### 参数调节

侧边栏中提供两个可调参数：

- **灵敏度**（1–10，默认 5）：滚动速度倍率，值越大滚动越快
- **死区**（1–20，默认 8）：低于此角度阈值的微小倾斜会被忽略，防止手抖导致误触

## 项目结构

```
Void-Remote-Control/
├── src/
│   ├── manifest.json           # MV3 扩展清单
│   ├── background.js           # Service Worker：消息路由
│   ├── content/
│   │   └── content.js          # 内容脚本：执行平滑滚动
│   └── sidepanel/
│       ├── sidepanel.html      # 侧边栏界面
│       ├── sidepanel.js        # 核心逻辑：手势识别 + 滚动控制
│       └── sidepanel.css       # 暗色主题样式
├── dist/                       # 构建产物（可直接加载）
├── build.js                    # 构建脚本
└── package.json                # 项目配置
```

## 工作原理

```
摄像头画面
  → MediaPipe HandLandmarker 检测手部 21 个关键点
  → 检测食指和中指是否伸展
  → 计算两指尖连线与水平线的夹角和方向
  → 死区过滤 → 指数平滑（0.6/0.4 权重）
  → 生成滚动速度指令（~30fps）
  → background.js 路由到当前标签页
  → content.js 找到可滚动容器执行滚动
```

## 常见问题

### 点击"启动追踪"后一直显示加载中

- 首次使用需下载手势模型（约 12MB），请确保网络畅通
- 如果 GPU 加速不可用，扩展会自动切换到 CPU 模式，可能需要稍等
- 超时时间：WASM 加载 15 秒、模型下载 30 秒、摄像头获取 10 秒

### 摄像头权限弹窗没有出现

部分浏览器版本在侧边栏中不会弹出权限请求。请手动前往浏览器设置，为该扩展允许摄像头权限。

### 滚动不够灵敏 / 太灵敏

调节侧边栏中的「灵敏度」滑块。同时可以调整「死区」值——死区越小，越小的倾斜角度就能触发滚动，但也更容易受手部抖动影响。

## 技术栈

- [MediaPipe HandLandmarker](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) — 手部关键点检测
- Chrome Extensions Manifest V3
- 原生 JavaScript（无框架依赖）

## 许可证

MIT
