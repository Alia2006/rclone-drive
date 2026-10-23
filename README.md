# Rclone Drive & Sync

<div align="center">

![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-blue?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri)
![Vue](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js)
![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=flat-square&logo=rust)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

**轻量、现代化的全功能 Rclone 云端硬盘虚拟挂载与同步调度工具（RaiDrive 替代方案）**

</div>

---

> **📌 项目来源声明**
>
> 本项目源自原作者 **[@alan0830](https://github.com/alan0830)** 的开源作品 [alan0830/rclone-drive](https://github.com/alan0830/rclone-drive)，感谢原作者提供的优秀基础实现。
>
> 当前维护仓库为 [**Alia2006/rclone-drive**](https://github.com/Alia2006/rclone-drive)，在本项目中原作者的基础之上继续维护并新增功能（中国大陆常用网盘支持、远程子路径挂载等）。原始代码与设计的版权归原作者所有，本项目遵循相同的 MIT 许可协议。

---

## 🌟 特色亮点

- **💽 虚拟硬盘挂载 (RaiDrive 体验)**：
  - 将 Google Drive、OneDrive、Dropbox、WebDAV、SFTP、S3、PikPak、坚果云、OpenList 聚合网盘等云端空间挂载为 Windows 本机盘符（如 `Z:`、`Y:`、`X:`）。
  - **各云端专属磁盘图标**：挂载后资源管理器自动应用各云端专属图标（如 Google Drive、Dropbox、OneDrive、WebDAV 等），告别空白的白纸图标。
  - 全面采用稳定的网络磁盘机制（`--network-mode`），一般用户权限即可秒速挂载，兼容 Office 即点即用与各类文件读写。
  - 支持 VFS 缓存模式调整（`full` / `writes` / `minimal` / `off`）。

- **🎨 全图形化云端管理 (告别黑窗口)**：
  - 内置精美的图形化向导，无需打开命令提示符黑窗口。
  - 支持 Google Drive / OneDrive 默认浏览器一键 OAuth 登录授权与重新授权。
  - 每张硬盘卡片均提供「修改设置」功能，可随时调整密码、账号或连接网址。

- **🔄 文件同步与差异比对 (RcloneView Plus 风格)**：
  - 支持两端路径快速比对（`Check Diff`），可视化标注添加、修改与缺失文件。
  - 提供单向镜像同步（`Sync`）与安全增量备份（`Copy`）模式。

- **⏰ 后台定时调度任务**：
  - 可创建多组调度任务，定时自动将指定文件夹备份至云端。
  - 即使关闭窗口，只要常驻系统托盘即可在后台自动运行。

- **🎛️ Windows 系统托盘常驻与开机自启 (System Tray)**：
  - 点击窗口关闭 (X) 自动最小化至右下角系统托盘。
  - 双击系统托盘图标即可秒开主界面，右键提供快捷操作菜单。
  - **开机自动启动与缩小至系统托盘**：支持登录 Windows 自动启动，并可自由切换「开机启动后直接缩小至系统托盘常驻」或显示主窗口。

- **🌐 官方 Web-GUI 一键集成**：
  - 内置 Rclone 原生 Web-GUI 服务器启动与控制，支持直接在浏览器标签页中进行高级操作。

- **🇨🇳 中国大陆常用网盘支持**：
  - **PikPak**：rclone 原生直连，图形化输入账号密码即可挂载（rclone v1.63+ 原生支持）。
  - **坚果云 (Nutstore)**：内置 WebDAV 预设，使用「应用密码」直连。
  - **123 云盘**：内置官方 WebDAV 预设（VIP / SVIP 会员权益），使用「应用密码」直连。
  - **百度网盘 / 阿里云盘 / 夸克网盘 / 115 / 天翼云盘 / 迅雷云盘**：官方 rclone 未内置其私有协议，本项目通过 OpenList / AList 的 WebDAV 接口统一挂载，可同时聚合多个网盘。

- **⚡ 体积极致轻巧**：
  - 基于 Tauri v2 + WebView2，单一可执行文件仅约 **4.5 MB**，内存占用极低。

---

## 🇨🇳 中国大陆网盘支持方式

| 网盘服务 | 支持方式 | 说明 |
| --- | --- | --- |
| PikPak | rclone 原生 `pikpak` 后端 | 账号 + 密码直连，不打开浏览器；需 rclone v1.63 及以上 |
| 坚果云 (Nutstore) | WebDAV | 地址固定 `https://dav.jianguoyun.com/dav/`，密码须使用「应用密码」 |
| 123 云盘 | 官方 WebDAV（VIP / SVIP） | 地址固定 `https://webdav.123pan.cn/webdav`，须在「工具中心 ➔ 第三方挂载」生成应用密码 |
| 百度网盘 / 阿里云盘 / 夸克网盘 / 115 网盘 / 天翼云盘 / 迅雷云盘 | OpenList / AList WebDAV | 先在 OpenList 中添加网盘并开启 WebDAV，再在软件中选择「OpenList / AList 聚合」 |

> 说明：百度网盘、阿里云盘、夸克网盘等私有协议未被官方 rclone 收录，本项目不内置、不分发任何第三方二进制。若希望原生直连，可将 rclone 路径指向自行信任的社区分支，其新增后端会自动出现在「更多 Rclone 原版存储提供商」列表中，也可配合「原版终端向导」完成配置。

### OpenList / AList 配置步骤

1. 部署并启动 [OpenList](https://github.com/OpenListTeam/OpenList)（或 AList）。
2. 打开 OpenList 管理后台，在「存储」中添加百度网盘、阿里云盘、夸克网盘、115 等账号，并确认可正常浏览文件。
3. 在「设置 ➔ 全局 ➔ WebDAV」中确认已开启（默认地址为 `http://<主机>:5244/dav`）。
4. 回到本软件：「添加云端硬盘 ➔ 中国大陆常用网盘 ➔ OpenList / AList 聚合」，填写 WebDAV 地址、OpenList 用户名与密码，即可挂载为本地盘符。

---

## 📋 系统要求

1. **Windows 10 / 11** (64-bit)
2. **[WinFsp](https://winfsp.dev/)**（Windows 虚拟文件系统核心，挂载盘符必备依赖）
3. **[Rclone](https://rclone.org/downloads/)**（默认路径建议放于 `C:\rclone\rclone.exe`，亦可在软件中自定义路径）

---

## 🚀 下载与使用

前往 [Releases 页面](../../releases) 下载最新版本：

- **标准安装引导版 (`RcloneDrive_vX.X.X_x64_Setup.exe`)**：推荐！标准 NSIS 安装向导，自动创建桌面与开始菜单快捷方式，支持原地覆盖升级。
- **单一免安装便携版 (`RcloneDrive_vX.X.X_Portable_x64.exe`)**：下载后开箱即用，免安装，适合U盘或临时测试。
- **MSI 安装包 (`RcloneDrive_vX.X.X_x64.msi`)**：企业批量部署适用的 Windows Installer 打包格式。

---

## 🛡️ 首次下载安全性提示（SmartScreen / 杀毒软件告警说明）

由于本项目为免费开源软件，且每当新版本刚发布时尚未累积大量下载信誉，部分杀毒软件（如 Symantec 赛门铁克、趋势科技）或 Windows Defender SmartScreen 可能会弹出安全性提示：
- **「关于此文件的信息结果不明」**、**「极少用户」**、**「极新」**
- **「Windows 已保护你的电脑」**（SmartScreen 提示未知的发行者）

### 💡 这是正常现象，请放心使用：
1. **为什么会弹出提示？**
   商业软件通常每年花费高额费用购买企业 EV 代码签名证书；开源项目在发布全新版本时，杀毒软件信誉库（Reputation-based Protection）因「样本刚发布、在该杀毒软件用户社区中累积下载次数较少」而主动提醒，并非含有恶意代码。本项目代码完全开源透明，欢迎审阅审计。
2. **如何允许运行？**
   - **Symantec (赛门铁克)**：点击提示窗口中的 **「允许此文件」** 即可正常运行。
   - **Windows Defender SmartScreen**：点击提示界面上的 **「更多信息」**（More info） ➔ 点击 **「仍要运行」**（Run anyway）。
   - **Chrome / Edge 浏览器**：若下载时显示安全拦截，点击右侧 `...` 菜单 ➔ 点击 **「保留」** ➔ **「仍要保留」**。

### 🔍 哈希值比对验证 (SHA-256 Checksum)
为了确保您下载的文件完整且未遭受任何第三方篡改，本项目在每次发行的 [GitHub Releases 页面](../../releases) 均提供各文件的 SHA-256 哈希值（以及 `checksums.txt`）。

您可以在 Windows PowerShell 中运行以下命令检验下载文件的哈希值：

```powershell
# 检验安装包哈希值
Get-FileHash .\RcloneDrive_v1.6.6_x64_Setup.exe -Algorithm SHA256

# 检验便携版哈希值
Get-FileHash .\RcloneDrive_v1.6.6_Portable_x64.exe -Algorithm SHA256
```

比对输出的 `Hash` 字符串是否与 GitHub Releases 页面上公布的一致，即可 100% 确保文件未受损坏或篡改！

---

## 🛠️ 开发与编译

本项目采用 **Tauri v2** + **Vue 3**：

### 前置需求
- [Node.js](https://nodejs.org/) (>= 18)
- [Rust & Cargo](https://rustup.rs/) (MSVC toolchain)
- Microsoft Visual Studio C++ Build Tools

### 本地开发
```bash
# 1. 安装前端依赖
npm install

# 2. 启动桌面开发预览
npm run tauri dev
```

### 打包正式发行版
```bash
# 打包产出单一独立 .exe 与安装程序 (NSIS / MSI)
npm run tauri build
```
产出的文件将位于 `src-tauri/target/release/` 与 `src-tauri/target/release/bundle/nsis/`。

---

## 📄 开源授权

本项目基于 [MIT License](LICENSE) 开源。

- **原始项目**：[alan0830/rclone-drive](https://github.com/alan0830/rclone-drive)，作者 [@alan0830](https://github.com/alan0830)，原始代码与设计的版权归原作者所有。
- **本仓库**：[Alia2006/rclone-drive](https://github.com/Alia2006/rclone-drive)，为上述项目的衍生维护版本，在此基础之上进行修改与功能增强，并同样以 MIT 许可协议开源。
