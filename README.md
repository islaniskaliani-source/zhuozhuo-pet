# 卓卓 Zhuozhuo — 真猫桌宠 / Real-Cat Desktop Pet

一只基于真实猫咪照片的 Electron 桌宠。它会在你的桌面上走路、舔毛、打滚、睡觉，时不时跳起来说句话，还能用鼠标拎起来。

A desktop pet built from photos of a real cat. It walks, grooms, rolls around, naps, randomly pops speech bubbles, and can be picked up with the mouse.

## 功能 / Features

- **透明置顶窗口** — 无边框、透明、始终置顶，不占任务栏
- **行为状态机** — 闲逛、走路、跳跃、舔毛、睡觉、玩耍，按权重随机切换
- **鼠标穿透** — 没点在猫身上时点击直接穿透到桌面，不影响正常干活
- **互动** — 单击撸猫、拖拽拎猫、半空松手会掉下去（带重力）
- **随机发言** — 每 25–75 秒冒一次中文猫话气泡，早上/深夜/饭点有不同台词
- **系统托盘** — 暂停/继续、催它说句话、退出

## 下载即用 / Download & Run (No Node.js needed)

前往 **[Releases](https://github.com/islaniskaliani-source/zhuozhuo-pet/releases)** 页面下载：

| 文件 | 平台 | 使用方式 |
|---|---|---|
| `ZhuozhuoPet-1.0.0.dmg` (arm64) | Apple Silicon Mac (M1–M4) | 打开后把图标拖进「应用程序」 |
| `ZhuozhuoPet-1.0.0-x64.dmg` | Intel Mac | 同上 |
| `ZhuozhuoPet Setup 1.0.0.exe` | Windows 10/11 | 双击安装，自动运行 |

> **首次打开提示（macOS）**：应用未做付费签名公证，Gatekeeper 可能提示"无法打开"。解决：**右键点击应用 → 打开 → 再点打开**，仅第一次需要。
> Windows 同理可能弹 SmartScreen：点「更多信息」→「仍要运行」。

## 从源码运行 / Run from Source

```bash
npm install
npm start
```

要求 Node.js 18+。`npm install` 会下载 Electron（约 100MB）。

> **网络受限 / 沙箱环境提示：** 如果 `npm install` 后 Electron 启动崩溃（macOS framework 符号链接损坏），改为手动把 Electron zip 解压到 `vendor/Electron.app`，然后直接运行：
> ```bash
> ./vendor/Electron.app/Contents/MacOS/Electron .
> ```
> `vendor/` 已在 `.gitignore` 中，不会被提交。

## 资源文件 / Assets

- `assets/spritesheet.webp` — 1536×1872 精灵图（8 列 × 9 行，每格 192×208），符合 [Petdex](https://petdex.dev) 桌宠规范
- `assets/tray.png` — 托盘图标

精灵图行序：`idle / walk / jump / attack / defend / die / win / lose / custom`。本应用把猫映射为：走路=walk、舔毛=lose、睡觉=die、打滚玩耍=win、被抓=attack、跳跃=jump。

素材由真实猫咪照片抠图（macOS Vision 前景分割）生成。

## 定制 / Customizing

- **换台词**：编辑 `renderer/app.js` 里的 `LINES` 字典
- **换行为权重**：同文件 `WEIGHTS`（idle/walk/groom/sleep/play/jump）
- **换大小/速度**：`SCALE`、`WALK_SPEED`、`FRAME_MS`
- **换猫**：替换 `assets/spritesheet.webp` 为任意 Petdex 规范精灵图即可

## 已知说明 / Notes

- 单实例锁：重复启动不会跑出第二只猫
- 与 Qoder 桌宠可以同时开——屏幕上会出现两只卓卓，这是特性不是 bug 🐱

## License

MIT — 详见 [LICENSE](LICENSE)
